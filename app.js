"use strict";

const AisEncode  = require ("ggencoder").AisEncode;
const AisDecode  = require ("ggencoder").AisDecode;
const NmeaEncode = require ("ggencoder").NmeaEncode;
const NmeaDecode = require ("ggencoder").NmeaDecode;

const express = require('express');
const app = express();
const bodyParser = require('body-parser');

const net = require('net');
const geolib = require('geolib');
const Magvar = require('magvar');
var fs = require('fs');

const mdns = require('multicast-dns')();
const ip = require("ip");

var MathFunc = {
	    add : function(a, b) {
		return [ a[0] + b[0], a[1] + b[1], a[2] + b[2] ]
	    },
	    sub : function(a, b) {
		return [ a[0] - b[0], a[1] - b[1], a[2] - b[2] ]
	    },
	    mulScalar : function(a, s) {
		return [ a[0] * s, a[1] * s, a[2] * s ]
	    },
	    dot : function(a, b) {
		return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
	    },
	    lengthSquared : function(a) {
		return a[0] * a[0] + a[1] * a[1] + a[2] * a[2]
	    }
	};

const motionpredict = require('lethexa-motionpredict').withMathFunc(MathFunc);

// how many minutes to keep old targets that we have not seen and ais broadcast
// for
const ageOldTargets = true;
const ageOldTargetsTTL = 15;

const tcpPort = 39150;
const httpPort = 39151;

const aisHostname = '127.0.0.1';
const aisPort = 3000;

var gps = {};
var targets = {};
var aisSession = {};
var anchorWatch = {
        setAnchor: 0,
        alarmRadius: 30
};

var ii = 10;
var jj = 10;

// for testing:
gps = {
	lat: (1+0/60),
	lon: (1+0/60),
	cog: 0,
	sog: 0,
}

// for testing
// for (var i=0; i<ii; i++) {
// for (var j=0; j<jj; j++) {
// var mmsi = (100000000+(i*ii+j)+1).toString();
// targets[mmsi] = {
// mmsi: mmsi,
// lat: (1+i/60),
// lon: (1+j/60),
// cog: 45,
// sog: 3,
// targetType: (i*ii+j),
// }
// console.log(i,j,targets[mmsi].mmsi,targets[mmsi].lat,targets[mmsi].lon);
// }
// }
// console.log(targets);

 targets['970111111'] = {
 mmsi: '970111111',
 lat: 1,
 lon: 1.05,
 cog: 0,
 sog: 0,
 };

//setup auto-discovery
mdns.on('query', function(query) {
    if (query.questions[0] && query.questions[0].name === '_vesper-nmea0183._tcp.local') {
        console.log('got a query packet:', query,'\n');
        mdns.respond({
            answers: [
                {
                    name: '_vesper-nmea0183._tcp.local', 
                    type: 'PTR', 
                    class: 'IN',
                    ttl: 300,
                    flush: true,
                    data: 'ribbit._vesper-nmea0183._tcp.local'
                }
            ],
            additionals: [
                { 
                    name: 'ribbit.local',
                    type: 'A',
                    class: 'IN',
                    ttl: 300,
                    flush: true,
                    data: ip.address()
                },{ 
                    name: 'ribbit.local',
                    type: 'AAAA',
                    class: 'IN',
                    ttl: 300,
                    flush: true,
                    data: ip.address('public','ipv6')
                },{ 
                    name: 'ribbit._vesper-nmea0183._tcp.local',
                    type: 'SRV',
                    class: 'IN',
                    ttl: 300,
                    flush: true,
                    data: {
                        port: 39150,
                        weigth: 0,
                        priority: 10,
                        target: 'ribbit.local'
                    }
                },{ 
                    name: 'ribbit._vesper-nmea0183._tcp.local',
                    type: 'TXT',
                    class: 'IN',
                    ttl: 300,
                    flush: true,
                    data: 'nm=ribbit'
                }
            ]
        });
    }
});

// the mobile app is picky about the model number and version numbers
// you dont get all functionality unless you provide valid values
// serial number does not seem to matter
var aisDeviceModel = {
 connectedDeviceType: 'XB-8000',
 connectedDeviceUiVersion: '3.04.17316',
 connectedDeviceTxVersion: '5.20.17443',
 connectedDeviceTxBbVersion: '1.2.4.0',
 connectedDeviceSerialNumber: '----'
};

// NEED SAMPLES OF:

// GET /datamodel/getModel?AnchorWatch
// GET /v3/openChannel - spins...
// GET /v3/subscribeChannel?Sensors - 404
// GET /v3/subscribeChannel?HeartBeat - 404
// GET /v3/subscribeChannel?AnchorWatch - 404
// GET /v3/subscribeChannel?AnchorWatchControl - 404
// GET /v3/subscribeChannel?VesselPositionUnderway - 404
// GET /v3/subscribeChannel?VesselPositionHistory - 404
// GET /alarms/mute_alarm
// TCP Server Received:$PVSP,KDGST,S*19
// TCP Server Received:$PVSP,QNEMOELEMS*23

// GET /prefs/setPreferences?profile.current=COASTAL
// GET /prefs/getPreferences?profile.current

// GET /v3/watchMate/collisionProfiles

// TODO: improvements:
// integrate with raspberry pi io terminals to trigger audible alarm when:
// - cpa alarm
// - guard alarm
// - mob/sart detection
// - anchor watch alarm
// - loss of gps fix
// integrate with raspberry pi io terminals to silence the alarm (push button)
// age out gps fix when stale
// accept alarm mute command from app
// persist anchor watch state

var collisionProfiles;

collisionProfiles = getCollisionProfiles('collisionProfiles.json');

// if it failed to load, try load the backup/original copy
if (!collisionProfiles) {
    collisionProfiles = getCollisionProfiles('collisionProfiles-original.json');
}

saveCollisionProfiles();

function getDeviceModelXml() {
	var xml = 
`<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<DeviceModel>
<connectedDeviceType>${aisDeviceModel.connectedDeviceType}</connectedDeviceType>
<connectedDeviceUiVersion>${aisDeviceModel.connectedDeviceUiVersion}</connectedDeviceUiVersion>
<connectedDeviceTxVersion>${aisDeviceModel.connectedDeviceTxVersion}</connectedDeviceTxVersion>
<connectedDeviceTxBbVersion>${aisDeviceModel.connectedDeviceTxBbVersion}</connectedDeviceTxBbVersion>
<connectedDeviceSerialNumber>${aisDeviceModel.connectedDeviceSerialNumber}</connectedDeviceSerialNumber>
</DeviceModel>
</Watchmate>`;
	return xml;
}

// FIXME: check if we can use hasGPS=0 while there is no fix
// so that we don't send any other gps data until we have a fix

// FIXME: age out old GPS fix data - i.e. older that 5 minutes and revert back
// to hasGPS=0 (no fix)?

function getGpsModelXml() {
return `<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<GPSModel>
<hasGPS>1</hasGPS>
<latitudeText>${formatLat(gps.lat)}</latitudeText>
<longitudeText>${formatLon(gps.lon)}</longitudeText>
<COG>${formatCog(gps.cog)}</COG>
<SOG>${formatSog(gps.sog)}</SOG>
<HDGT>${formatCog(gps.hdg)}</HDGT>
<magvar>${formatMagvar(gps.magvar)}</magvar>
<hasBowPosition>0</hasBowPosition>
<sim>stop</sim>
</GPSModel>
</Watchmate>`
}

function getGpsModelAdvancedXml() {
	return `<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<GPSModel>
<hasGPS>1</hasGPS>
<latitudeText>${formatLat(gps.lat)}</latitudeText>
<longitudeText>${formatLon(gps.lon)}</longitudeText>
<COG>${formatCog(gps.cog)}</COG>
<SOG>${formatSog(gps.sog)}</SOG>
<HDGT>${formatCog(gps.hdg)}</HDGT>
<magvar>${formatMagvar(gps.magvar)}</magvar>
<hasBowPosition>0</hasBowPosition>
<sim>stop</sim>
<Fix>
<fixType>2</fixType>
<AutoMode>1</AutoMode>
<HDOP>0.94</HDOP>
<PDOP>1.86</PDOP>
<VDOP>1.61</VDOP>
<metersAccuracy>1.9</metersAccuracy>
<fix_ids>2</fix_ids>
<fix_ids>5</fix_ids>
<fix_ids>6</fix_ids>
<fix_ids>9</fix_ids>
<fix_ids>12</fix_ids>
<fix_ids>17</fix_ids>
<fix_ids>19</fix_ids>
<fix_ids>23</fix_ids>
<fix_ids>25</fix_ids>
</Fix>
<GPSSatsInView>
<SatID>2</SatID>
<El>059</El>
<Az>296</Az>
<SNR>39</SNR>
</GPSSatsInView>
<GPSSatsInView>
<SatID>5</SatID>
<El>028</El>
<Az>210</Az>
<SNR>40</SNR>
</GPSSatsInView>
<GPSSatsInView>
<SatID>6</SatID>
<El>059</El>
<Az>042</Az>
<SNR>46</SNR>
</GPSSatsInView>
<GPSSatsInView>
<SatID>9</SatID>
<El>024</El>
<Az>079</Az>
<SNR>42</SNR>
</GPSSatsInView>
<GPSSatsInView>
<SatID>12</SatID>
<El>047</El>
<Az>274</Az>
<SNR>36</SNR>
</GPSSatsInView>
<GPSSatsInView>
<SatID>17</SatID>
<El>029</El>
<Az>121</Az>
<SNR>38</SNR>
</GPSSatsInView>
<GPSSatsInView>
<SatID>19</SatID>
<El>055</El>
<Az>111</Az>
<SNR>29</SNR>
</GPSSatsInView>
<GPSSatsInView>
<SatID>23</SatID>
<El>015</El>
<Az>053</Az>
<SNR>37</SNR>
</GPSSatsInView>
<GPSSatsInView>
<SatID>25</SatID>
<El>023</El>
<Az>312</Az>
<SNR>33</SNR>
</GPSSatsInView>
</GPSModel>
</Watchmate>`
}


function getTxStatusModelXml() {
return `<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<TxStatus>
<warnMMSI>0</warnMMSI>
<warnSilent>0</warnSilent>
<warnStartup>0</warnStartup>
<warnGPS>0</warnGPS>
<warnPosReportSent>0</warnPosReportSent>
<statusVSWR>1</statusVSWR>
<valueVSWR>6</valueVSWR>
<antennaInUse>0</antennaInUse>
<gpsSBAS>0</gpsSBAS>
<gpsSmooth>1</gpsSmooth>
<gpsFastUpdate>0</gpsFastUpdate>
<nmeaInBaud>4800</nmeaInBaud>
<nmeaOutBaud>38400</nmeaOutBaud>
<nmeaEchoAIS>1</nmeaEchoAIS>
<nmeaEchoVDO>1</nmeaEchoVDO>
<nmeaEchoGPS>1</nmeaEchoGPS>
<nmeaEchoN2K>1</nmeaEchoN2K>
<nmeaEchoNMEA>1</nmeaEchoNMEA>
<n2kBus>2</n2kBus>
<n2kProdCode>9511</n2kProdCode>
<n2kAdr>21</n2kAdr>
<n2kDevInst>0</n2kDevInst>
<n2kSysInst>0</n2kSysInst>
<n2kPosRate>500</n2kPosRate>
<n2kCogRate>500</n2kCogRate>
<externalAlarm>2</externalAlarm>
<extSwitchFunc>2</extSwitchFunc>
<extSwitchState>0</extSwitchState>
<channelStatus>
<frequency>161.975</frequency>
<mode>1</mode>
<rssi>-105</rssi>
<rxCount>118</rxCount>
<txCount>3</txCount>
</channelStatus>
<channelStatus>
<frequency>162.025</frequency>
<mode>1</mode>
<rssi>-104</rssi>
<rxCount>121</rxCount>
<txCount>0</txCount>
</channelStatus>
</TxStatus>
</Watchmate>`;
}

function getAnchorWatchModelXml() {
return `<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<AnchorWatch>
<setAnchor>${anchorWatch.setAnchor}</setAnchor>
<alarmRadius>${anchorWatch.alarmRadius}</alarmRadius>
<alarmsEnabled>${anchorWatch.setAnchor}</alarmsEnabled>
<anchorLatitude>${anchorWatch.anchorLatitude||''}</anchorLatitude>
<anchorLongitude>${anchorWatch.anchorLongitude||''}</anchorLongitude>
<anchorCorrectedLat></anchorCorrectedLat>
<anchorCorrectedLong></anchorCorrectedLong>
<usingCorrected>0</usingCorrected>
<distanceToAnchor>3</distanceToAnchor>
<bearingToAnchor>123</bearingToAnchor>
<alarmTriggered>0</alarmTriggered>
</AnchorWatch>
</Watchmate>`;
}

function getOwnStaticDataXml() {
return `<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<OwnStaticData>
<MMSI>111111111</MMSI>
<Name>UNKNOWN</Name>
<CallSign></CallSign>
<VesselType>36</VesselType>
<VesselSize a='1' b='2' c='3' d='4'/>
</OwnStaticData>
</Watchmate>`;    
}

function getPreferencesXml() {
return `<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<Prefs>
<PrefsRequested>
{2,{"accept.demo_mode",""},{"profile.current","${collisionProfiles.current.toUpperCase()}"}}
</PrefsRequested>
<Pref prefname='accept.demo_mode'>0</Pref>
<Pref prefname='profile.current'>${collisionProfiles.current.toUpperCase()}</Pref>
</Prefs>
</Watchmate>`;
}

function getAlarmsXml() {
    var response = 
`<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='1'>
`;    

    for (var mmsi in targets) {
        var target = targets[mmsi];
        if (target.dangerState) {
            response += 
`<Alarm MMSI='${target.mmsi}' state='${target.dangerState||''}' type='${target.alarmType||''}'>
<Name>${target.name||''}</Name>
<COG>${formatCog(target.cog)}</COG>
<SOG>${formatSog(target.sog)}</SOG>
<CPA>${formatCpa(target.cpa)}</CPA>
<TCPA>${formatTcpa(target.tcpa)}</TCPA>
<Range>${formatRange(target.range)}</Range>
<BearingTrue>${target.bearing||''}</BearingTrue>
<TargetType>${target.targetType||''}</TargetType>
</Alarm>
`;
        }
    }

    response += '</Watchmate>';
    return response;
}

function getSimsXml() {
return `<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<SimFiles>
<simfile>TamakiStrait.sim</simfile>
<simfile>TamakiStraitMOB.sim</simfile>
<simfile>VirginIslands.sim</simfile>
<simfile>AnchorWatch.sim</simfile>
</SimFiles>
<sim>stop</sim>
</Watchmate>`
}

function getTargetsXml() {
    var response = 
`<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
`;	

    for (var mmsi in targets) {
	var target = targets[mmsi];
	response += 
`<Target>
<MMSI>${target.mmsi}</MMSI>
<Name>${target.name||''}</Name>
<CallSign>${target.callsign||''}</CallSign> 
<VesselTypeString>${target.VesselTypeString||''}</VesselTypeString>
<VesselType>${target.VesselType||''}</VesselType>
<TargetType>${target.targetType||''}</TargetType>
<Order>${target.order||''}</Order>
<TCPA>${formatTcpa(target.tcpa)}</TCPA>
<CPA>${formatCpa(target.cpa)}</CPA>
<Bearing>${target.bearing||''}</Bearing>
<Range>${formatRange(target.range)}</Range>
<COG2>${formatCog(target.cog)}</COG2>
<SOG>${formatSog(target.sog)}</SOG>
<DangerState>${target.dangerState||''}</DangerState>
<AlarmType>${target.alarmType||''}</AlarmType>
<FilteredState>${target.filteredState||''}</FilteredState>
</Target>
`;
    }

    response += '</Watchmate>';
    return response;
}

function getTargetDetails(mmsi) {
    var response = 
`<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
`;	

    var target = targets[mmsi];

    if (target !== undefined) {
	response += 
`<Target>
<IMO>0</IMO>
<COG>${formatCog(target.cog)}</COG>
<HDG>${formatCog(target.hdg)}</HDG>
<ROT></ROT>
<Altitude>-1</Altitude>
<latitudeText>${formatLat(target.lat)}</latitudeText>
<longitudeText>${formatLon(target.lon)}</longitudeText>
<OffPosition>0</OffPosition>
<Virtual>0</Virtual>
<Dimensions>---</Dimensions>
<Draft>---</Draft>
<ClassType>${target.classType||''}</ClassType>
<Destination></Destination>
<ETAText></ETAText>
<NavStatus>${target.navstatus||''}</NavStatus>
<MMSI>${mmsi||''}</MMSI>
<Name>${target.name||''}</Name>
<CallSign>${target.callsign||''}</CallSign> 
<VesselTypeString>${target.VesselTypeString||''}</VesselTypeString>
<VesselType>${target.VesselType||''}</VesselType>
<TargetType>${target.targetType||''}</TargetType>
<Order>${target.order||''}</Order>
<TCPA>${formatTcpa(target.tcpa)}</TCPA>
<CPA>${formatCpa(target.cpa)}</CPA>
<Bearing>${target.bearing||''}</Bearing>
<Range>${formatRange(target.range)}</Range>
<COG2>${formatCog(target.cog)}</COG2>
<SOG>${formatSog(target.sog)}</SOG>
<DangerState>${target.dangerState||''}</DangerState>
<AlarmType>${target.alarmType||''}</AlarmType>
<FilteredState>${target.filteredState||''}</FilteredState>
</Target>
`;
    }

    response += '</Watchmate>';
    return response;
}

function getCollisionProfilesJson() {
  return JSON.stringify(collisionProfiles,null,2);
}


// ======================= HTTP SERVER ========================
// listens to requests from mobile app

// disable cache / etag / 304 responses
// noted some requests sending 304s and the mobile app freaks out 
app.set('etag',false);

// log all requests
app.use(function(req, res, next) {
    console.info(`${req.method} ${req.originalUrl}`);

	// express.js automatically adds utf-8 encoding to everything. this
	// overrides that. the watchmate mobile app cannot deal with utf-8.
    // res.setHeader('Content-Type', 'text/xml; charset=ISO-8859-1');
    res.setHeader('Content-Type', 'text/html; charset=ISO-8859-1');
	next();
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// sanity
app.get('/', (req, res) => res.send('Hello World!'));

// GET /datamodel/getModel?*****
app.get('/datamodel/getModel', (req, res) => {

    // console.log(req.query);
    
    // GET /datamodel/getModel?DeviceModel
    if (req.query.DeviceModel==='') {
    	res.send( new Buffer(getDeviceModelXml(),'latin1') );
    } 
    
    // GET /datamodel/getModel?GPSModel
    else if (req.query.GPSModel==='') {
    	res.send( new Buffer(getGpsModelXml(),'latin1') );
    } 
    
    // GET /datamodel/getModel?GPSModel.,Advanced
    else if (req.query["GPSModel.,Advanced"]==='') {
    	res.send( new Buffer(getGpsModelAdvancedXml(),'latin1') );
    } 
    
    // GET /datamodel/getModel?TxStatus
    else if (req.query.TxStatus==='') {
    	res.send( new Buffer(getTxStatusModelXml(),'latin1') );
    } 
    
    // GET /datamodel/getModel?AnchorWatch
    else if (req.query.AnchorWatch==='') {
    	res.send( new Buffer(getAnchorWatchModelXml(),'latin1') );
    } 

    // GET /datamodel/getModel?OwnStaticData
    else if (req.query.OwnStaticData==='') {
        res.send( new Buffer(getOwnStaticDataXml(),'latin1') );
    }
    
    // everything else gets a 404
    else {
// res.set('Content-Type', 'text/xml');
// var xml = `<?xml version='1.0' encoding='ISO-8859-1' ?>
// <Watchmate version='1.0' priority='0'>
// </Watchmate>`;
// res.send( new Buffer(xml,'latin1') );
        console.log(`*** sending 404 for ${req.method} ${req.originalUrl}`);
        res.sendStatus(404);
    }

});

// GET /prefs/getPreferences?accept.demo_mode&profile.current
app.get('/prefs/getPreferences', (req, res) => {
    res.send( new Buffer(getPreferencesXml(),'latin1') );
});

// GET /prefs/setPreferences?profile.current=OFFSHORE
app.get('/prefs/setPreferences', (req, res) => {
    if (req.query["profile.current"]) {
        collisionProfiles.current = req.query["profile.current"].toLowerCase();
        saveCollisionProfiles();
        res.send( new Buffer(getPreferencesXml(),'latin1') );
    }
    
    else {
        console.log(`*** sending 404 for ${req.method} ${req.originalUrl}`);
        res.sendStatus(404);
    }
});

// GET /alarms/get_current_list
app.get('/alarms/get_current_list', (req, res) => {
    res.send( new Buffer(getAlarmsXml(),'latin1') );
});

// GET /test/getSimFiles
app.get('/test/getSimFiles', (req, res) => {
    res.send( new Buffer(getSimsXml(),'latin1') );
});

// GET /targets/getTargets
app.get('/targets/getTargets', (req, res) => {
    res.send( new Buffer(getTargetsXml(),'latin1') );
});

// GET /targets/getTargetDetails?MMSI=255805923
app.get('/targets/getTargetDetails', (req, res) => {
    var mmsi = req.query.MMSI;
    res.send( new Buffer(getTargetDetails(mmsi),'latin1') );
});

// GET /v3/watchMate/collisionProfiles
app.get('/v3/watchMate/collisionProfiles', (req, res) => {
    res.send( new Buffer(getCollisionProfilesJson(),'latin1') );
});

// PUT /v3/watchMate/collisionProfiles
app.put('/v3/watchMate/collisionProfiles', (req, res) => {
    // console.log(req.body);
    // the body is already parsed to json by express
    collisionProfiles = req.body;
    saveCollisionProfiles();
    res.sendStatus(204);
});

// GET /prefs/start_notifying - "Hello" 200 text/html
app.get('/prefs/start_notifying', (req, res) => {
    res.send( new Buffer('Hello','latin1') );
});

// FIXME: add
// drop anchor / turn anchor watch on:
// GET /datamodel/propertyEdited?AnchorWatch.setAnchor=1
// then check: /datamodel/getModel?AnchorWatch
// change anchor watch radius
// GET /datamodel/propertyEdited?AnchorWatch.alarmRadius=38
// weigh anchor / turn anchor watch off:
// GET /datamodel/propertyEdited?AnchorWatch.setAnchor=0

// GET /datamodel/propertyEdited?AnchorWatch.setAnchor=1
app.get('/datamodel/propertyEdited', (req, res) => {
    var setAnchor = req.query["AnchorWatch.setAnchor"];
    
    if (req.query["AnchorWatch.setAnchor"]) {
        console.log('setting anchorWatch.setAnchor',req.query["AnchorWatch.setAnchor"]);
        anchorWatch.setAnchor = req.query["AnchorWatch.setAnchor"];
        anchorWatch.anchorLatitude = gps.lat;
        anchorWatch.anchorLongitude = gps.lon;
    }
    
    if (req.query["AnchorWatch.alarmsEnabled"]) {
        console.log('setting anchorWatch.alarmsEnabled',req.query["AnchorWatch.alarmsEnabled"]);
        anchorWatch.alarmsEnabled = req.query["AnchorWatch.alarmsEnabled"];
    }
    
    if (req.query["AnchorWatch.alarmRadius"]) {
        console.log('setting anchorWatch.alarmRadius',req.query["AnchorWatch.alarmRadius"]);
        anchorWatch.alarmRadius = req.query["AnchorWatch.alarmRadius"];
    }

    res.sendStatus(200);
});

// everything else gets a 404
app.get('*', function(req, res) {
// res.set('Content-Type', 'text/xml');
// var xml = `<?xml version='1.0' encoding='ISO-8859-1' ?>
// <Watchmate version='1.0' priority='0'>
// </Watchmate>`;
// res.send( new Buffer(xml,'latin1') );
    console.log(`*** sending 404 for ${req.method} ${req.originalUrl}`);
    res.sendStatus(404);
});

app.listen(httpPort, () => console.log(`HTTP server listening on port ${httpPort}!`));

// ======================= TCP SERVER ========================
// listens to requests from mobile app

var connectionNumber = 0;
let connections = [];

const tcpServer = net.createServer((connection) => {
    
    connectionNumber++;
    console.log(`TCP Server: new connection ${connectionNumber} ${connection.remoteAddress}:${connection.remotePort}`);
    
    connection.id = connectionNumber;
    connections.push(connection);
    console.log('connections',connections.length);
    
    connection.on('data', data => {
        console.log(`TCP Server: connection DATA ${connectionNumber} ${connection.remoteAddress}:${connection.remotePort} ${data.toString('latin1')}`);
    });

    connection.on('close', () => {
        console.log(`TCP Server: connection CLOSE ${connectionNumber} ${connection.remoteAddress}:${connection.remotePort}`);
        // connections.splice(connections.indexOf(connection), 1);
        console.log('connections',connections.length);
    });
    
    connection.on('end', () => {
        console.log(`TCP Server: connection END ${connectionNumber} ${connection.remoteAddress}:${connection.remotePort}`);
        connections.splice(connections.indexOf(connection), 1);
        console.log('connections',connections.length);
    });
    
});

tcpServer.on('error', (err) => {
    console.log('TCP Server: whoops!');
    console.error;
    // throw err;
});

tcpServer.listen(tcpPort, () => {
    console.log(`TCP Server: listening on ${tcpServer.address().address}:${tcpServer.address().port}`);
});

function broadcast(msg) {
    connections.map(connection => {
        try {
            connection.write(msg);
        }
        catch (err) {
            console.log('error in broadcast',err.message)
        }
    });
}

// $GPRMC = Recommended minimum specific GPS/Transit data
// $GPVTG = Track Made Good and Ground Speed
// $GPGGA = Global Positioning System Fix Data
// $GPGSA = GPS DOP and active satellites
// $GPGSV = GPS Satellites in view
// $GPGLL = Geographic Position, Latitude / Longitude and time

// the app wants to see traffic on port 39150. if it does not, it will
// periodically reinitialize. i guess this is a mechanism to try and restore
// what it perceives as lost connectivity with the AIS unit. The app does
// not actually appear to use this data though - instead relying on getting
// everything it needs from the web interfaces.

setInterval(function(){
    console.log('start tcp xmit');
    
    var message = '';
    
    /*
     * var data =
     * `$GPRMC,203538.00,A,3732.60174,N,07619.93740,W,0.047,77.90,201018,10.96,W,A*35
     * $GPVTG,77.90,T,88.87,M,0.047,N,0.087,K,A*29
     * $GPGGA,203538.00,3732.60174,N,07619.93740,W,1,06,1.48,-14.7,M,-35.6,M,,*79
     * $GPGSA,A,3,21,32,10,24,20,15,,,,,,,2.96,1.48,2.56*00
     * $GPGSV,2,1,08,08,03,314,31,10,46,313,39,15,35,057,36,20,74,341,35*71
     * $GPGSV,2,2,08,21,53,204,41,24,58,079,32,27,,,35,32,28,257,36*4E
     * $GPGLL,3732.60174,N,07619.93740,W,203538.00,A,A*75`; socket.write(data);
     */

    if (gps.lat === undefined 
            || gps.lon === undefined
            || gps.sog === undefined
            || gps.cog === undefined) {
        console.log('cant generate nmea gps message: missing data');
        return;
    } else {
        // console.log('gps',gps);
        // encode NMEA message
        var nmeaMsg = new NmeaEncode({ 
            // standard class B Position report
            // msgtype : 18, <== NOTE: this breaks things!
            lat        : gps.lat,
            lon        : gps.lon,
            cog        : gps.cog,
            sog        : gps.sog
        }); 
        
        // console.log(nmeaMsg,nmeaMsg.valid,nmeaMsg.nmea);
        if (nmeaMsg.valid) message += nmeaMsg.nmea + '\n';
    }
    
    // FIXME should we send the proper ais class A vs B message ?
    
    for (var mmsi in targets) {
        var target = targets[mmsi];

        // encode AIS message
        var encMsg = new AisEncode({
            aistype    : 3,
            mmsi       : target.mmsi,
            lat: target.lat,
            lon: target.lon,
            cog: target.cog,
            sog: target.sog,
            navstatus: target.navstatus
        }); 
        
        // console.log(encMsg,encMsg.valid,encMsg.nmea);
        if (encMsg.valid) message += encMsg.nmea + '\n';

        // encode AIS message
        var encMsg = new AisEncode ({
            aistype    : 5,
            mmsi       : target.mmsi,
            callsign: target.callsign,
            shipname: target.shipname,
            cargo: target.cargo,
        }); 
        
        // console.log(encMsg,encMsg.valid,encMsg.nmea);
        if (encMsg.valid) message += encMsg.nmea + '\n';
    }
    
    broadcast(message);

}, 4000);
    

// ======================= TCP CLIENT ========================
// gets data from AIS

let socket = new net.Socket()

// FIXME: humm... ok
socket.setEncoding('latin1');

function connect() {
    console.log("new socket");
    
    socket.connect(aisPort, aisHostname, () => {
	console.log("Connected")
        // socket.write("Hello, server! Love, socket.")
    });

    socket.on("data", data => {
        console.log("Received: " + data);
        processReceivedAisData(data);
    });

    socket.on("close", () => {
        console.log("Connection closed")
        reconnect()
    });

    socket.on("end", () => {
        console.log("Connection ended")
        reconnect()
    });

    socket.on("error", () => {
	// console.error;
        console.log("Connection refused")
    });
}

function processReceivedAisData(data) {
    var dataString = data.toString('latin1');
    // split on carriage returns and lines feeds
    var lines = dataString.split(/\r\n|\r|\n/g);
    
    for (var line of lines) {
        processAIScommand(line);
    }
}

function processAIScommand(line) {
    
    // console.log('processAIScommand',line);

    // decode and AIS message
    if (line.startsWith('!AI')) { 
        var decMsg = new AisDecode (line, aisSession);
        // console.log ('%j', decMsg);

        if (decMsg.valid && decMsg.mmsi) {
    	
    	var target = targets[decMsg.mmsi];
    	
    	// console.log('target',target);
    	
    	if (!target) {
    	    target = {};
    	}

    	target.mmsi = decMsg.mmsi;
    	target.lastSeen = new Date().toISOString();

    	// console.log('target',target);

    	if (decMsg.shipname !== undefined) {
    	    target.name = decMsg.shipname;
    	}
    	
    	if (decMsg.lat !== undefined) {
    	    target.lat = decMsg.lat;
    	    target.lon = decMsg.lon;
    	}
    	
        if (decMsg.cog !== undefined) {
            target.cog = decMsg.cog;
        }

        // NOTE: hdg=511 is a default value that indicates heading is not
        // available
        if (decMsg.hdg !== undefined && decMsg.hdg<=360) {
            target.hdg = decMsg.hdg;
        }

    	if (decMsg.sog !== undefined) {
    	    target.sog = decMsg.sog;
    	}

    	if (decMsg.cargo !== undefined) {
    	    target.VesselType = decMsg.cargo;
    	    target.VesselTypeString = decMsg.GetVesselType();
    	}
		    
    	// <NavStatus>15</NavStatus>
        // 0: "Under way using engine",
        // 1: "At anchor"
        if (decMsg.navstatus !== undefined) {
            target.navstatus = decMsg.navstatus;
        }
		    
        // <ClassType>ATON</ClassType>
		// 1: "Position Report Class A",
		// 14: "Safety Related Broadcast Message",
        if (decMsg.class !== undefined) {
            target.classType = decMsg.class;
        }

        if (decMsg.callsign !== undefined) {
            target.callsign = decMsg.callsign;
        }
        
        // class A
        if (decMsg.class === 'A') {
            target.targetType = 1;
        }
        // class B
        else if (decMsg.class === 'B') {
            target.targetType = 2;
        }
        // Aid to Navigation
        else if (decMsg.aistype == 21 || decMsg.mmsi.startsWith('99')) {
            target.targetType = 4;
        }
        // SART
        else if (decMsg.mmsi.startsWith('970')) {
            target.targetType = 6;
        }
        // MOB
        else if (decMsg.mmsi.startsWith('972')) {
            target.targetType = 7;
        }
        // EPIRB
        else if (decMsg.mmsi.startsWith('974')) {
            target.targetType = 8;
        }
        
        // target.targetType = 1;
        // 1 = ship - pointy box
        // 2 = triangle
        // 3 = triangle
        // 4 = diamond
        // 5 = triangle
        // 6 = circle/cross sart
        // 7 = mob
        // 8 = epirb
        // 993 = aton

    	targets[decMsg.mmsi] = target;

    	// console.log('target',target);
    	// console.log('targets',targets);

        }

    }
    
    // decode NMEA message
    if (line.startsWith('$GP')) {
        var decMsg = new NmeaDecode (line);
        // console.log ('%j', decMsg);
        
	    // FIXME: add GPS accuracy and satellite data... meh
		
        if (decMsg.valid) {
            if (decMsg.lat !== undefined) {
            	gps.lat = decMsg.lat;
            	gps.lon = decMsg.lon;
            	gps.magvar = Magvar.Get(gps.lat, gps.lon);
            }
	
            if (decMsg.cog !== undefined) {
                gps.cog = decMsg.cog;
            }

            if (decMsg.sog !== undefined) {
                gps.sog = decMsg.sog;
            }

            // console.log('gps',gps);
        }
        
    }
}

// do initial connection attempt to ais transponder
connect();

// try reconnect to the ais transponder if the connection drops
function reconnect() {
    setTimeout(() => {
        socket.removeAllListeners(); 
        connect();
    }, 1000);
}

// latitudeText: 'N 39° 57.0689',
function formatLat(dec) {
    var decAbs = Math.abs(dec);
    var deg = ('0' + Math.floor(decAbs)).slice(-2)  ;
    var min = ('0' + ((decAbs - deg) * 60).toFixed(4)).slice(-7);
    return (dec > 0 ? "N" : "S") + " " + deg + "° " + min;
}

// longitudeText: 'W 075° 08.3692',
function formatLon(dec) {
    var decAbs = Math.abs(dec);
    var deg = ('00' + Math.floor(decAbs)).slice(-3)  ;
    var min = ('0' + ((decAbs - deg) * 60).toFixed(4)).slice(-7);
    return (dec > 0 ? "E" : "W") + " " + deg + "° " + min;
}

function calculateRangeAndBearing(target) {
    if (gps.lat === undefined 
	    || gps.lon === undefined
	    || target.lat === undefined
	    || target.lon === undefined) {
	console.log('cant calc calculateRangeAndBearing: missing data',target.mmsi);
	target.range = undefined;
	target.bearing = undefined;
	return;
    }

    // or geolib.getDistanceSimple...?
    
    var range = geolib.convertUnit(
	    'sm', 
	    geolib.getDistance(
		    {latitude: gps.lat, longitude: gps.lon},
		    {latitude: target.lat, longitude: target.lon}
	    )
    );
    
    var bearing = Math.round(geolib.getRhumbLineBearing(
	    {latitude: gps.lat, longitude: gps.lon},
	    {latitude: target.lat, longitude: target.lon}
    ));
    
    target.range = range;
    target.bearing = bearing;
}

setInterval(updateAllTargets, 5000);

function updateAllTargets() {
    for (var mmsi in targets) {
    	var target = targets[mmsi];
    	var targetDeleted = false;

    	if (ageOldTargets) {
    	    targetDeleted = ageOutOldTargets(target);
    	}

    	if (!targetDeleted) {
            calculateRangeAndBearing(target);
            updateCpa(target);
            evaluateAlarms(target);
    	}
    }
}

function ageOutOldTargets(target) {
    if ( (new Date() - new Date(target.lastSeen))/1000/60 > ageOldTargetsTTL ) {
        console.log('deleting',target.mmsi,target.lastSeen,new Date().toISOString());
        delete targets[target.mmsi];
        return true;
    }
}

function updateCpa(target) {
    if (gps.lat === undefined 
	    || gps.lon === undefined
	    || gps.sog === undefined
	    || gps.cog === undefined
	    || target.lat === undefined
	    || target.lon === undefined
	    || target.sog === undefined
	    || target.cog === undefined) {
	console.log('cant calc cpa: missing data',target.mmsi);
        target.cpa = undefined;
        target.tcpa = undefined;
	return;
    }
    
     // position: lat and lon in degrees
     // velocity: in degrees/sec N/S and E/W
    
     var position1 = [ gps.lat, gps.lon, 0 ];
     var velocity1 = generateSpeedVector(gps.lat,gps.sog,gps.cog);
    
     var position2 = [ target.lat, target.lon, 0 ];
     var velocity2 = generateSpeedVector(target.lon,target.sog,target.cog);
     
     // console.log(position1,velocity1,position2,velocity2);
    
     // tcpa in seconds, from now
    
     var tcpa = motionpredict.calcCPATime(position1,velocity1,position2,velocity2);
     // console.log('tcpa (Secs)',tcpa,tcpa/60,tcpa/3600);
     
     if (!tcpa) {
         console.log('cant calc tcpa: ',target.mmsi);
         target.cpa = undefined;
         target.tcpa = undefined;
         return;
     }
    
     var cpaPosition1 = motionpredict.getPositionByVeloAndTime(position1,velocity1,tcpa);
     var cpaPosition2 = motionpredict.getPositionByVeloAndTime(position2,velocity2,tcpa);
    
     var cpa = geolib.convertUnit('sm',geolib.getDistanceSimple({
         latitude : cpaPosition1[0],
         longitude : cpaPosition1[1]
     }, {
         latitude : cpaPosition2[0],
         longitude : cpaPosition2[1]
     }));
    
     // console.log('cpa (NM)',cpa);
    
     target.cpa = cpa;
     target.tcpa = tcpa;
}

function generateSpeedVector (latitude, speed, course) {
    var northSpeed = speed * Math.cos(course * Math.PI / 180) / 60 / 3600;
    var eastSpeed = speed * Math.sin(course * Math.PI / 180) / 60 / 3600 * Math.abs(Math.sin(latitude * Math.PI / 180));
    return [northSpeed, eastSpeed, 0]
}    

function evaluateAlarms(target) {
    // <Order>8190</Order>
    // <DangerState>danger</DangerState>
    // <AlarmType>guard</AlarmType>
    // <FilteredState>show</FilteredState>
    
    // guard alarm
    target.guardAlarm = (
            target.range < collisionProfiles[collisionProfiles.current].guard.range 
            && (target.sog > collisionProfiles[collisionProfiles.current].guard.speed
                    || collisionProfiles[collisionProfiles.current].guard.speed == 0)
    );
    
    // collision alarm
    target.collisionAlarm = (
            target.cpa < collisionProfiles[collisionProfiles.current].danger.cpa
            && target.tcpa > 0
            && target.tcpa < collisionProfiles[collisionProfiles.current].danger.tcpa 
            && (target.sog > collisionProfiles[collisionProfiles.current].danger.speed
                    || collisionProfiles[collisionProfiles.current].danger.speed == 0)
    );
        
    // collision warning
    target.collisionWarning = (
            target.cpa < collisionProfiles[collisionProfiles.current].warning.cpa
            && target.tcpa > 0
            && target.tcpa < collisionProfiles[collisionProfiles.current].warning.tcpa 
            && (target.sog > collisionProfiles[collisionProfiles.current].warning.speed
                    || collisionProfiles[collisionProfiles.current].warning.speed == 0)
    );
    
    target.sartAlarm = (target.mmsi.startsWith('970'));
    target.mobAlarm = (target.mmsi.startsWith('972'));
    target.epirbAlarm = (target.mmsi.startsWith('974'));
    
    var order;
    
    // alarm
    if (target.guardAlarm 
            || target.collisionAlarm 
            || target.sartAlarm 
            || target.mobAlarm 
            || target.epirbAlarm) {
        target.dangerState = 'danger';
        target.filteredState = 'show';
        order = 8190;
    }
    // threat
    else if (target.collisionWarning) {
        // "warning" does not produce orange icons or alams in the app, but
        // "threat" does :)
        // target.dangerState = 'warning';
        target.dangerState = 'threat';
        target.filteredState = 'show';
        order = 16382;
    }
    // none
    else {
        target.dangerState = undefined;
        target.filteredState = 'hide';
        var order = 36862;
    }
    
    var alarms = [];

    if (target.guardAlarm) alarms.push('guard');
    if (target.collisionAlarm) alarms.push('cpa');
    if (target.sartAlarm) alarms.push('sart');
    if (target.mobAlarm) alarms.push('mob');
    if (target.epirbAlarm) alarms.push('epirb');
    if (target.collisionWarning) alarms.push('cpa');

    target.alarmType = alarms.join(',');

    if (target.tcpa > 0) {
        // tcpa of 0 seconds reduces order by 1000 (this is an arbitrary
        // weighting)
        // tcpa of 60 minutes reduces order by 0
        var weight = 1000;
        order -= (weight - weight/3600*target.tcpa);
    }

    if (target.cpa > 0) {
        // cpa of 0 nm reduces order by 2000 (this is an arbitrary weighting)
        // cpa of 5 nm reduces order by 0
        var weight = 2000;
        order -= (weight - weight/5*target.cpa);
    }

    target.order = Math.round(order);

}

function formatCog(cog) {
    return cog === undefined ? '' : ('00' + Math.round(cog)).slice(-3);
}

function formatSog(sog) {
    return sog === undefined ? '' : sog.toFixed(1);    
}

function formatMagvar(magvar) {
    return magvar === undefined ? '' : magvar.toFixed(2);
}

function formatCpa(cpa) {
    return cpa === undefined ? '' : cpa.toFixed(2);
}

function formatTcpa(tcpa) {
    // returns hh:mm:ss, e.g. 01:15:23
    // 012345678901234567890
    // ******** start at 11, length 8
    // ***** start at 14, length 5
    // 1970-01-01T00:00:07.000Z
    if (tcpa === undefined) {
        return '';
    } else if (Math.abs(tcpa)>=3600) {
        return (tcpa<0 ? '-' : '') + new Date(1000 * Math.abs(tcpa)).toISOString().substr(11,8)
    } else {
        return (tcpa<0 ? '-' : '') + new Date(1000 * Math.abs(tcpa)).toISOString().substr(14,5)
    }
}

function formatRange(range) {
    return range === undefined ? '' : range.toFixed(2);
}

function getCollisionProfiles(filename) {
    var myObj;
    try {
        var data = fs.readFileSync(`./${filename}`);
        myObj = JSON.parse(data);
        // console.dir(myObj);
    }
    catch (err) {
        console.log('There has been an error parsing your JSON.')
        console.log(err.message);
    }
    return myObj;
}

function saveCollisionProfiles() {
    try {
        var data = JSON.stringify(collisionProfiles);
        fs.writeFile('./collisionProfiles.json', data, function (err) {
            if (err) {
                console.log('There has been an error saving your configuration data.');
                console.log(err.message);
                return;
            }
            console.log('Configuration saved successfully.')
        });
    }
    catch (err) {
        console.log('There has been an error saving your configuration data.')
        console.log(err.message);
    }
}

