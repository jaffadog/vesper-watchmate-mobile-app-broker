 "use strict";

const AisDecode  = require ("ggencoder").AisDecode;
//const NmeaDecode = require ("ggencoder").NmeaDecode;

var _ = require('lodash');

const nmea = require("nmea-simple");

const express = require('express');
const app = express();
const bodyParser = require('body-parser');

var SSE = require('./sse.js')
var sse = new SSE();

const net = require('net');
const geolib = require('geolib');
const fs = require('fs');

const mdns = require('multicast-dns')();
const ip = require("ip");

const xmlescape = require('xml-escape');

var proxy = require("node-tcp-proxy");

const { exec } = require('child_process');

// FIXME: need a more elegant way to handle this. loading gpio blows up
// on non-pi platforms
var Gpio = undefined;
var buzzer = undefined;
var button = undefined;

try {
    Gpio = require('onoff').Gpio;
    
    buzzer = new Gpio(17, 'out');
    button = new Gpio(4, 'in', 'rising', {debounceTimeout: 10});

    button.watch((err, value) => {
        console.log('alarm off');
        if (err) {
            throw err;
        }

        muteAlarms();
    });
}
catch (err) {
    console.log('error setting up gpio',err);
}

const autoAnchorProfile = true;

const updateClock = true;
const maxClockDriftSecs = 60;

// how long to keep old targets that we have not seen in a while
// in minutes
const ageOldTargets = true;
const ageOldTargetsTTL = 20;

// save changes to collision profiles and current state to disk? or just keep in
// memory and reset to factory state on reboot?
// raspberry pi might be setup with read only file system (for sd card
// durability) which would prevent saving
const saveCollisionProfilesEnabled = false;

const nmeaServerPort = 39150;
const vesperSmartAisHttpPort = 39151;

const myMmsi = '368204530';

// FIXME: these are point of config... maybe use properties file.. or command
// line parameters
// where should we get ais/gps nmea data from?
// const aisHostname = 'raspberrypi0.local';
const aisHostname = '10.10.100.254';
const aisPort = 8899;

var gps = {};
var targets = {};
var aisSession = {};
/*
var anchorWatch = {
        setAnchor: 0,
        alarmRadius: 30,
        alarmsEnabled: 0,
        alarmTriggered: 0,
};
*/
var anchorWatchControl = {
	setAnchor:0,
    alarmRadius: 30,
    alarmsEnabled: 0,
	anchorLatitude:0,
	anchorLongitude:0,
	anchorCorrectedLat:0,
	anchorCorrectedLong:0,
	usingCorrected:0,
	distanceToAnchor:0,
	bearingToAnchor:0,
    alarmTriggered: 0,
	anchorPosition:{
		a:0,
		o:0,
		t:0
	}
};

/*
<AnchorWatch>
	<setAnchor>1</setAnchor>
	<alarmRadius>30</alarmRadius>
	<alarmsEnabled>1</alarmsEnabled>
	<anchorLatitude>399510671</anchorLatitude>
	<anchorLongitude>-751394869</anchorLongitude>
	<anchorCorrectedLat></anchorCorrectedLat>
	<anchorCorrectedLong></anchorCorrectedLong>
	<usingCorrected>0</usingCorrected>
	<distanceToAnchor>0</distanceToAnchor>
	<bearingToAnchor>97</bearingToAnchor>
	<alarmTriggered>0</alarmTriggered>
</AnchorWatch>
*/

var alarm;
var targetAlarm = false;
var targetAlarmUpdate = false;
var anchorAlarm = false
var positions = [];
// save position every 2 seconds when underway. this changes to every 30 seconds when anchored.
var savePositionIntervalWhenUnderway = 2000;
var savePositionIntervalWhenAnchored = 30000;
var savePositionInterval = savePositionIntervalWhenUnderway;
// 86,400 seconds per 24 hour day. 86400/2 = 43200. 86400/30 = 2880.
// TODO
var savePositionsDuration = 111;

// setup auto-discovery
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
                    // FIXME: the ip6 block below result inthe mobile app
                    // reporting an additional
                    // discovery with ip 0.0.0.0
                    // },{
                    // name: 'ribbit.local',
                    // type: 'AAAA',
                    // class: 'IN',
                    // ttl: 300,
                    // flush: true,
                    // data: ip.address('public','ipv6')
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
// integrate with raspberry pi gpio terminals to trigger audible alarm when:
// - cpa alarm - fast alarm
// - guard alarm - fast alarm
// - mob/sart detection - fast alarm
// - anchor watch alarm - med alarm
// - loss of gps fix - slow alarm
// integrate with raspberry pi gpio terminals to silence the alarm (push button)
// age out gps fix when stale
// accept alarm mute command from app
// persist anchor watch state

// should we advance ais targets using dead reconning?

// for anchor watch, store position every 30 secs for 24 hours (2880 points)
// automatically activate anchor watch when boat is stopped for 5 mins... or
// detect reverse movement
// automatically turn anchor watch off when... moving more than x knots? or more
// that x miles from anchor?
// automatically switch to anchored profile when anchored - DONE
// automatically switch to coastal profile when anchor up - DONE

// pi needs:
// 12v in (or 5v depending on what we do for power)
// switch lead
// buzzer/LED lead
// nmea in (ethernet... or wifi... or ttl/uart...)

// pi zero power:
// boot: 120-140 mA @ 5v = 0.6-0.7 w = 50-60 mA @ 12v = 1.4 Ah
// idle: 50-70 mA @ 5v = 20-30 mA @ 12v = 0.7 Ah
// xb6000 2.5 w = 5 Ah
// xb8000 4.0 w = 8 Ah

var collisionProfiles = getCollisionProfiles('collisionProfiles.json');

// if it failed to load, try load the backup/original copy
if (!collisionProfiles) {
    collisionProfiles = getCollisionProfiles('collisionProfiles-original.json');
    saveCollisionProfiles();
}

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

// anchorLatitude of 399510671 == N 39° 57.0645
// 39.9510671 = 39 deg 57.064026 mins
function getAnchorWatchModelXml() {
return `<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<AnchorWatch>
<setAnchor>${anchorWatchControl.setAnchor}</setAnchor>
<alarmRadius>${anchorWatchControl.alarmRadius}</alarmRadius>
<alarmsEnabled>${anchorWatchControl.alarmsEnabled}</alarmsEnabled>
<anchorLatitude>${anchorWatchControl.anchorPosition.a}</anchorLatitude>
<anchorLongitude>${anchorWatchControl.anchorPosition.o}</anchorLongitude>
<anchorCorrectedLat></anchorCorrectedLat>
<anchorCorrectedLong></anchorCorrectedLong>
<usingCorrected>0</usingCorrected>
<distanceToAnchor>${anchorWatchControl.distanceToAnchor||''}</distanceToAnchor>
<bearingToAnchor>${anchorWatchControl.bearingToAnchor||''}</bearingToAnchor>
<alarmTriggered>${anchorWatchControl.alarmTriggered}</alarmTriggered>
</AnchorWatch>
</Watchmate>`;
}

function getOwnStaticDataXml() {
return `<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<OwnStaticData>
<MMSI>${myMmsi}</MMSI>
<Name>MYNAME</Name>
<CallSign>MYCALLSIGN</CallSign>
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
{2,{"accept.demo_mode",""},{"profile.current",""}}
</PrefsRequested>
<Pref prefname='accept.demo_mode'>0</Pref>
<Pref prefname='profile.current'>${collisionProfiles.current.toUpperCase()}</Pref>
</Prefs>
</Watchmate>`;
}

// {2,{"accept.demo_mode",""},{"profile.current","${collisionProfiles.current.toUpperCase()}"}}

// FIXME: should this return an empty body if there are no alarms?
// or an empty <Alarm/>
// something other than a 200 status?
// 404 response if there are none?

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
<Name>${xmlescape(target.name)||''}</Name>
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

// FIXME 404 response if there are none?

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
<Name>${xmlescape(target.name)||''}</Name>
<CallSign>${xmlescape(target.callsign)||''}</CallSign> 
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
<IMO>${target.imo||''}</IMO>
<COG>${formatCog(target.cog)}</COG>
<HDG>${formatCog(target.hdg)}</HDG>
<ROT>${formatRot(target.rot)}</ROT>
<Altitude>-1</Altitude>
<latitudeText>${formatLat(target.lat)}</latitudeText>
<longitudeText>${formatLon(target.lon)}</longitudeText>
<OffPosition>0</OffPosition>
<Virtual>0</Virtual>
<Dimensions>${target.length||''}m x ${target.width||''}m</Dimensions>
<Draft>${target.draught||''}m</Draft>
<ClassType>${target.classType||''}</ClassType>
<Destination>${xmlescape(target.destination)||''}</Destination>
<ETAText></ETAText>
<NavStatus>${target.navstatus||''}</NavStatus>
<MMSI>${mmsi||''}</MMSI>
<Name>${xmlescape(target.name)||''}</Name>
<CallSign>${xmlescape(target.callsign)||''}</CallSign> 
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
    //console.info(`${req.method} ${req.originalUrl}`);

	// express.js automatically adds utf-8 encoding to everything. this
	// overrides that. the watchmate mobile app cannot deal with utf-8.
    // res.setHeader('Content-Type', 'text/xml; charset=ISO-8859-1');
    res.setHeader('Content-Type', 'text/html; charset=ISO-8859-1');
    
// res.sseSetup = function() {
// res.writeHead(200, {
// 'Content-Type': 'text/event-stream',
// 'Cache-Control': 'no-cache',
// 'Connection': 'keep-alive'
// })
// }
//
// res.sseSend = function(data) {
// //res.write(data + "\n\n");
// res.write("data:777:heartbeat" + JSON.stringify(data) + "\n\n");
// }

	next();
});

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
//app.use(bodyParser.urlencoded({ extended: true }));

// parse application/json
app.use(bodyParser.json());

// sanity
app.get('/', (req, res) => res.send('Hello World!'));

// GET /datamodel/getModel?*****
app.get('/datamodel/getModel', (req, res) => {

    // console.log(req.query);
    
    // GET /datamodel/getModel?DeviceModel
    if (req.query.DeviceModel==='') {
    	res.send( new Buffer.from(getDeviceModelXml(),'latin1') );
    } 
    
    // GET /datamodel/getModel?GPSModel
    else if (req.query.GPSModel==='') {
    	res.send( new Buffer.from(getGpsModelXml(),'latin1') );
    } 
    
    // GET /datamodel/getModel?GPSModel.,Advanced
	// GET /datamodel/getModel?GPSModel.Advanced
    else if (req.query["GPSModel.,Advanced"]==='' || req.query["GPSModel.Advanced"]==='') {
    	res.send( new Buffer.from(getGpsModelAdvancedXml(),'latin1') );
    } 
    
    // GET /datamodel/getModel?TxStatus
    else if (req.query.TxStatus==='') {
    	res.send( new Buffer.from(getTxStatusModelXml(),'latin1') );
    } 
    
    // GET /datamodel/getModel?AnchorWatch
    else if (req.query.AnchorWatch==='') {
    	res.send( new Buffer.from(getAnchorWatchModelXml(),'latin1') );
    } 

    // GET /datamodel/getModel?OwnStaticData
    else if (req.query.OwnStaticData==='') {
        res.send( new Buffer.from(getOwnStaticDataXml(),'latin1') );
    }
    
    // unexpected request
    else {
        console.log(`*** unexpected request ${req.method} ${req.originalUrl}`);
        res.sendStatus(200);
    }

});

// GET /prefs/getPreferences?accept.demo_mode&profile.current
app.get('/prefs/getPreferences', (req, res) => {
    res.send( new Buffer.from(getPreferencesXml(),'latin1') );
});

// GET /prefs/setPreferences?profile.current=OFFSHORE
app.get('/prefs/setPreferences', (req, res) => {
    if (req.query["profile.current"]) {
        collisionProfiles.current = req.query["profile.current"].toLowerCase();
        saveCollisionProfiles();
        res.send( new Buffer.from(getPreferencesXml(),'latin1') );
    }
    
    else {
        console.log(`*** sending 404 for ${req.method} ${req.originalUrl}`);
        res.sendStatus(404);
    }
});

// GET /alarms/mute_alarm
app.get('/alarms/mute_alarm', (req, res) => {
    muteAlarms();
    res.sendStatus(200);
});

// GET /v3/control?muteAlarms
app.get('/v3/control', (req, res) => {
    if (req.query["muteAlarms"]) {
		muteAlarms();
		res.sendStatus(200);
    } else {
        console.log(`*** sending 404 for ${req.method} ${req.originalUrl}`);
        res.sendStatus(404);
	}
});

// GET /v3/tickle?xxxx
// GET /v3/tickle?AnchorWatch
// GET /v3/tickle?AnchorWatchControl
app.get('/v3/tickle', (req, res) => {
	console.log('req.query',req.query);

	// GET /v3/tickle?AnchorWatch
	if (req.query.AnchorWatch!==undefined) {
		console.log('GET /v3/tickle?AnchorWatch');
		sendSseMsg("VesselPositionHistory", positions);
		res.sendStatus(200);
    } 
	// GET /v3/tickle?AnchorWatchControl
	else if (req.query.AnchorWatchControl!==undefined) {
		console.log('GET /v3/tickle?AnchorWatchControl');
		// do what?
		res.sendStatus(200);
    } 
	// OTHER
	else {
        console.log(`*** sending 404 for ${req.method} ${req.originalUrl} ${req.query}`);
        res.sendStatus(404);
	}
});

// GET /alarms/get_current_list
app.get('/alarms/get_current_list', (req, res) => {

    res.send( new Buffer.from(getAlarmsXml(),'latin1') );

// var haveAnAlarm = false;
//    
// for (var mmsi in targets) {
// var target = targets[mmsi];
// if (target.dangerState) {
// haveAnAlarm = true;
// break;
// }
// }
//
// if (haveAnAlarm) {
// res.send( new Buffer.from(getAlarmsXml(),'latin1') );
// } else {
// // FIXME 404 or 204 ?
// // app blows on a 404
// res.sendStatus(204);
// }
});

// GET /test/getSimFiles
app.get('/test/getSimFiles', (req, res) => {
    res.send( new Buffer.from(getSimsXml(),'latin1') );
});

// GET /targets/getTargets
app.get('/targets/getTargets', (req, res) => {
    res.send( new Buffer.from(getTargetsXml(),'latin1') );
});

// GET /targets/getTargetDetails?MMSI=255805923
app.get('/targets/getTargetDetails', (req, res) => {
    var mmsi = req.query.MMSI;
    res.send( new Buffer.from(getTargetDetails(mmsi),'latin1') );
});

// GET /v3/watchMate/collisionProfiles
app.get('/v3/watchMate/collisionProfiles', (req, res) => {
    res.send( new Buffer.from(getCollisionProfilesJson(),'latin1') );
});

// PUT /v3/watchMate/collisionProfiles
// PUT /v3/watchMate/collisionProfiles { '{"harbor":{"guard":{"range":0.5}}}': '' }
// android: 
// 		guard, danger, warning
//		'content-type': 'application/x-www-form-urlencoded'
// ios: 
// 		guard, danger, warning... PLUS... threat. threat is same as warning.
//		'content-type': 'application/json'
app.put('/v3/watchMate/collisionProfiles', (req, res) => {
	
    console.log('PUT /v3/watchMate/collisionProfiles',req.body);

	mergePutData(req,collisionProfiles);

    saveCollisionProfiles();
    res.sendStatus(204);
});

// GET /prefs/start_notifying - "Hello" 200 text/html
app.get('/prefs/start_notifying', (req, res) => {
    res.send( new Buffer.from('Hello','latin1') );
});

function mergePutData(req,originalObject) {
	var contentType = req.header('content-type');
	var update = undefined;
	
	if (contentType && contentType === 'application/json') {
	    update = req.body;
	} else {
    	update = JSON.parse(Object.keys(req.body)[0])
	}
	
	//console.log('update',update);
	
	_.merge(originalObject,update);
	//console.log(originalObject);
}

// PUT /v3/anchorwatch/AnchorWatchControl
// { '{"setAnchor":true,"alarmsEnabled":true,"anchorPosition":{"a":413515813,"o":-723778936,"t":1581064687}}': '' }

/*
headers:
Feb 11 00:52:52 raspberrypi0 npm[1174]:    { 'content-type': 'application/x-www-form-urlencoded',

Feb 11 00:52:52 raspberrypi0 npm[1174]:   body:
Feb 11 00:52:52 raspberrypi0 npm[1174]:    { '{"setAnchor":true,"alarmsEnabled":true,"anchorPosition":{"a":416660266,"o":-712864514,"t":1581382370}}': '' },

*/

app.put('/v3/anchorwatch/AnchorWatchControl', (req, res) => {
    console.log('PUT /v3/anchorwatch/AnchorWatchControl',req.body);
    //console.log('req',req);
    //console.log('res',res);
    // the body is already parsed to json by express
    //anchorWatchControl = req.body;
	mergePutData(req,anchorWatchControl);

	/*
	anchorWatchControl.setAnchor = data.setAnchor;
	anchorWatchControl.alarmsEnabled = data.alarmsEnabled;
	anchorWatchControl.anchorPosition = data.anchorPosition;
	*/
	
	anchorWatchControl.anchorLatitude = anchorWatchControl.anchorPosition.a;
	anchorWatchControl.anchorLongitude = anchorWatchControl.anchorPosition.o;
	
	console.log('anchorWatchControl',anchorWatchControl);
	
	/*
	var anchorWatchControl = {
        "anchorPosition"    :  anchorWatch.setAnchor == 0 ? {} : {
            "a"             :   Math.round(anchorWatch.lat * 1e7), 
            "o"             :   Math.round(anchorWatch.lon * 1e7), 
            "t"             :   anchorWatch.time,
            "hasBowOffset"  : false,
            "da"            :   0,
            "do"            :   0
        }, 
        "setAnchor"         :   (anchorWatch.setAnchor == 1), 
        "alarmRadius"       :   anchorWatch.alarmRadius, 
        "alarmsEnabled"     :   (anchorWatch.alarmsEnabled == 1)
    };
	*/
	
	stopAlarm();
	
    res.sendStatus(204);
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
    
    if (req.query["AnchorWatch.setAnchor"]) {
        var setAnchor = req.query["AnchorWatch.setAnchor"];

        if (setAnchor == 1) {
            setAnchored();
        } else {
            setUnderway();
        }
    }

    if (req.query["AnchorWatch.alarmsEnabled"]) {
        console.log('setting anchorWatchControl.alarmsEnabled',req.query["AnchorWatch.alarmsEnabled"]);
        anchorWatchControl.alarmsEnabled = req.query["AnchorWatch.alarmsEnabled"];
    }
    
    if (req.query["AnchorWatch.alarmRadius"]) {
        console.log('setting anchorWatchControl.alarmRadius',req.query["AnchorWatch.alarmRadius"]);
        anchorWatchControl.alarmRadius = req.query["AnchorWatch.alarmRadius"];
    }

    res.sendStatus(200);
});

app.get('/v3/openChannel', sse.init);

// GET /v3/subscribeChannel?<anything>
app.get('/v3/subscribeChannel', (req, res) => {
    res.sendStatus(200);
});

// unexpected get request
//app.get('*', function(req, res) {
//    console.log(`*** unexpected get request ${req.method} ${req.originalUrl}`);
//    // console.log(req,'\n\n');
//    // console.log(res,'\n\n');
//    // res.sendStatus(200);
//    res.sendStatus(404);
//});

// unexpected put request
app.all('*', function(req, res) {
    console.log(`*** unexpected request ${req.method} ${req.originalUrl}`);
    console.log('headers=', req.headers);
    console.log('params=',req.params);
    console.log('body=',req.body);
    // console.log(req,'\n\n');
    // console.log(res,'\n\n');
    // res.sendStatus(200);
    res.sendStatus(404);
});

// unexpected post request
//app.post('*', function(req, res) {
//    console.log(`*** unexpected post request ${req.method} ${req.originalUrl}`);
//    // console.log(req,'\n\n');
//    // console.log(res,'\n\n');
//    // res.sendStatus(200);
//    res.sendStatus(404);
//});

app.listen(vesperSmartAisHttpPort,"0.0.0.0", () => console.log(`HTTP server listening on port ${vesperSmartAisHttpPort}!`));

async function everyFiveSeconds() {
	await updateAllTargets();
	await updateAnchorWatch();
	await manageAlarms();
}

// send heartbeat
setInterval(() => {
    // console.log('getMaxListeners()',sse.getMaxListeners());
    // 24:HeartBeat{"time":1576639319000}
    // {"time":1576639319000}       is 22 chars long. plus \n\n gets us to 24.

    // 24:HeartBeat{"time":1576808013923}
    sse.send("24:HeartBeat{\"time\":" + new Date().getTime() + "}\n\n");
}, 15000);

// send VesselPositionUnderway
setInterval(() => {
    // 75:VesselPositionUnderway{"a":407106833,"o":-740460408,"cog":0,"sog":0.0,"var":-13,"t":1576639404}
    // 80:VesselPositionUnderway{"a":380704720,"o":-785886085,"cog":220.28,"sog":0,"var":-9.77,"t":1576873731}
    // sse.send("75:VesselPositionUnderway{\"a\":407106833,\"o\":-740460408,\"cog\":0,\"sog\":0.0,\"var\":-13,\"t\":1576639404}\n\n");

    var vesselPositionUnderway = {
        "a"     :   Math.round(gps.lat * 1e7), 
        "o"     :   Math.round(gps.lon * 1e7), 
        "cog"   :   gps.cog, 
        "sog"   :   gps.sog, 
        "var"   :   gps.magvar, 
        "t"     :   gps.time
    };
    
    sendSseMsg("VesselPositionUnderway", vesselPositionUnderway);
}, 1000);

// send AnchorWatchControl
setInterval(() => {

 // 80:AnchorWatchControl{"anchorPosition":{},"setAnchor":false,"alarmRadius":22,"alarmsEnabled":false}
    /*
    var anchorWatchControl = {
        "anchorPosition"    :  anchorWatch.setAnchor == 0 ? {} : {
            "a"             :   Math.round(anchorWatch.lat * 1e7), 
            "o"             :   Math.round(anchorWatch.lon * 1e7), 
            "t"             :   anchorWatch.time,
            "hasBowOffset"  : false,
            "da"            :   0,
            "do"            :   0
        }, 
        "setAnchor"         :   (anchorWatch.setAnchor == 1), 
        "alarmRadius"       :   anchorWatch.alarmRadius, 
        "alarmsEnabled"     :   (anchorWatch.alarmsEnabled == 1)
    };
    */

    sendSseMsg("AnchorWatchControl", anchorWatchControl);
}, 1000);

// send AnchorWatch
setInterval(() => {
    
// 52:AnchorWatch{"outOfBounds":false,"anchorPreviousPositions":[]}

    var anchorWatchJson = {
        "outOfBounds"               :   (anchorWatchControl.alarmTriggered == 1), 
        "anchorPreviousPositions"   :   {}
    };
        
    sendSseMsg("AnchorWatch", anchorWatchJson);
}, 1000);

// send VesselPositionHistory (BIG message)
setInterval(() => {
        sendSseMsg("VesselPositionHistory", positions);
}, 5000);

// save position every 30 seconds
//setInterval(savePosition, 30000);
savePosition();

// update data models every 5 seconds
setInterval(everyFiveSeconds, 5000);

function sendSseMsg(name,data) {
    var json = JSON.stringify(data);
    sse.send((json.length + 2) + ":" + name + json + "\n\n");
}

// ======================= NMEA SERVER ========================
// listens to requests from mobile app

var aisProxy = proxy.createProxy(nmeaServerPort, aisHostname, aisPort, {
	hostname: '0.0.0.0',
	quiet: true
});

// ======================= TCP CLIENT ========================
// gets data from AIS

var socket;
var data = '';

function connect() {
    socket = new net.Socket()
    socket.setEncoding('latin1');
    console.log("Connection new socket");
    
    socket.connect(aisPort, aisHostname, () => {
        console.log("Connected")
    });

    socket.on("data", chunk => {
        // console.log("Received: " + chunk);
        data += chunk;
        
        var eol = data.indexOf('\n');
        
        while (eol > -1) {
            try {
                var message = data.substring(0, eol).toString('latin1');
                // console.log('message',message);
                processNmeaMessage(message);
            }
            catch (err) {
                console.log('error in connect.on.data', err, data, eol);
            }

            data = data.substring(eol + 1);
            eol = data.indexOf('\n');
        }
    });

    socket.on("close", () => {
        console.log("Connection closed");
    });

    socket.on("end", () => {
        console.log("Connection ended");
    });

    // app will crash if we dont catch error events here
    socket.on("error", (err) => {
        console.log("Connection refused",err);
    });
}

// start, monitor, and restart (as needed) connection to the ais device
setInterval(checkAisConnection, 3000);

function checkAisConnection() {
    if (!socket || !socket.readable) {
        if (socket) {
            try {
                console.log("Connection removeAllListeners");
                socket.removeAllListeners(); 
                console.log("Connection destroy");
                socket.destroy();
            }
            catch (err)
            {
                console.log('error cleaning up connection',err);
            }
        }
        connect();
    }
}

function processNmeaMessage(message) {
    
    // console.log('processNmeaMessage',message);

    // decode AIS message
    if (message.startsWith('!AI')) { 
		processAisMessage(message);
    }
    
	// decoe GPS message
    if (message.startsWith('$GPRMC')) {
		processRmcMessage(message);        
    }
}

function processAisMessage(message) {
	try {
		const decMsg = new AisDecode (message, aisSession);
        //console.log ('%j', decMsg);

        // ignore if not valid, no mmsi, or is my mmsi
        if (!decMsg.valid || !decMsg.mmsi || decMsg.mmsi === myMmsi) {
            return;
        }
    	
    	var target = targets[decMsg.mmsi];
    	
    	// console.log('target',target);
    	
    	if (!target) {
    	    target = {};
    	}

    	target.mmsi = decMsg.mmsi;
    	target.lastSeen = new Date().toISOString();

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

        if (decMsg.rot !== undefined) {
            target.rot = decMsg.rot;
        }

        // NOTE: hdg=511 is a default value that indicates heading is not
        // available
        if (decMsg.hdg !== undefined && decMsg.hdg<=360) {
            target.hdg = decMsg.hdg;
        }

    	if (decMsg.sog !== undefined) {
			// 102.3 = speed not available
			// 102.2 = speed is 102.2 or greater
    	    target.sog = (decMsg.sog <  102) ? decMsg.sog : 0; 
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
		

        if (decMsg.imo !== undefined) {
            target.imo = decMsg.imo;
        }
        
        if (decMsg.destination !== undefined) {
            target.destination = decMsg.destination;
        }
        
        if (decMsg.length !== undefined) {
            target.length = decMsg.length;
        }
        
        if (decMsg.width !== undefined) {
            target.width = decMsg.width;
        }
        
        if (decMsg.draught !== undefined) {
            target.draught = decMsg.draught;
        }
                
        // SART
        if (decMsg.mmsi.startsWith('970')) {
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
        // Aid to Navigation
        else if (decMsg.aistype == 21 || decMsg.mmsi.startsWith('99')) {
            target.targetType = 4;
        }
        // class A
        else if (decMsg.class === 'A') {
            target.targetType = 1;
        }
        // class B
        else { // if (decMsg.class === 'B') {
            target.targetType = 2;
        }
        
        // target.targetType = 1;
        // 1 = ship - pointy box class A
        // 2 = triangle class B
        // 3 = triangle ?
        // 4 = diamond AToN
        // 5 = triangle ?
        // 6 = circle/cross sart SART
        // 7 = mob MOB
        // 8 = epirb EPIRB
        // 993 = aton AToN

    	targets[decMsg.mmsi] = target;

    	// console.log('target',target);
    	// console.log('targets',targets);
	}	
	catch (err) {
	    console.log('error in processAisMessage',err,message);
	}
	
}

function processRmcMessage(message) {
	try {
		const rmc = nmea.parseNmeaSentence(message);
		
		gps.lat = rmc.latitude;
		gps.lon = rmc.longitude;
		gps.magvar = rmc.variationDirection === 'E' ? rmc.variation : -rmc.variation;
		gps.time = Math.round(rmc.datetime.getTime()/1000);
		gps.cog = rmc.trackTrue;
		gps.sog = rmc.speedKnots;
		
		//console.log(new Date(),rmc,gps);
	
		if (updateClock) {
	        // reset system time if variance is greater than 3 seconds
	        var clockDrift = Math.abs(new Date().getTime()/1000 - gps.time);
	        if ( clockDrift > maxClockDriftSecs ) {
	            console.log('*** updating system time - clockDrift',clockDrift, new Date(), rmc.datetime);
	            setSystemTime();
	        }
		}
	}
	catch (err) {
	    console.log('error in processRmcMessage',err,message);
	}

}

function setAnchored() {
    console.log('setting anchored');

	anchorWatchControl = {
		setAnchor:1,
	    alarmRadius: 30,
	    alarmsEnabled: 1,
	    alarmTriggered: 0,
		anchorLatitude:Math.round(gps.lat * 1e7),
		anchorLongitude:Math.round(gps.lon * 1e7),
		anchorCorrectedLat:0,
		anchorCorrectedLong:0,
		usingCorrected:0,
		distanceToAnchor:0,
		bearingToAnchor:0,
		anchorPosition:{
			a:Math.round(gps.lat * 1e7),
			o:Math.round(gps.lon * 1e7),
			t:gps.time
		}
	};

    collisionProfiles.current = "anchor";
    saveCollisionProfiles();
	savePositionInterval = savePositionIntervalWhenAnchored;
}

function setUnderway() {
    console.log('setting underway');

	anchorWatchControl = {
		setAnchor:0,
	    alarmRadius: 30,
	    alarmsEnabled: 0,
	    alarmTriggered: 0,
		anchorLatitude:0,
		anchorLongitude:0,
		anchorCorrectedLat:0,
		anchorCorrectedLong:0,
		usingCorrected:0,
		distanceToAnchor:0,
		bearingToAnchor:0,
		anchorPosition:{
			a:0,
			o:0,
			t:0
		}
	};

    collisionProfiles.current = "coastal";
    saveCollisionProfiles();
	savePositionInterval = savePositionIntervalWhenUnderway;
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
		//console.log('cant calc calculateRangeAndBearing: missing data',target.mmsi);
		target.range = undefined;
		target.bearing = undefined;
		return;
    }

    // or geolib.getDistanceSimple...?
    
    target.range = geolib.convertUnit(
	    'sm', 
	    geolib.getDistance(
		    {latitude: gps.lat, longitude: gps.lon},
		    {latitude: target.lat, longitude: target.lon}
	    )
    );
    
    target.bearing = Math.round(geolib.getRhumbLineBearing(
	    {latitude: gps.lat, longitude: gps.lon},
	    {latitude: target.lat, longitude: target.lon}
    ));

}

function setSystemTime() {
    console.log('setting system time',gps.time);
    
    if (gps.time && gps.time>0) {
        // date [-u|--utc|--universal] [MMDDhhmm[[CC]YY][.ss]]
        // sudo date --utc MMDDhhmmYYYY
        // sudo date --utc 121119462019

        // 0123456789012345678
        // 2019-12-11T20:13:47.597Z
        
        var now = new Date(gps.time * 1000).toISOString();
        
        exec('sudo date --utc ' 
                + now.substring(5,7)
                + now.substring(8,10)
                + now.substring(11,13)
                + now.substring(14,16)
                + now.substring(0,4)
                + '.' + now.substring(17,19)
        );
    }
}

async function updateAllTargets() {
	try {
	    addCoords(gps);
		addSpeed(gps);
		targetAlarmUpdate = false;
		
	    for (var mmsi in targets) {
	    	var target = targets[mmsi];
	
	    	if ( ageOldTargets && (new Date() - new Date(target.lastSeen))/1000/60 > ageOldTargetsTTL ) {
        		console.log('deleting',target.mmsi,target.lastSeen,new Date().toISOString());
		        delete targets[target.mmsi];
				continue;
			}
	
            calculateRangeAndBearing(target);
            updateCpa(target);
            evaluateAlarms(target);
	    	
	    	// console.log(target);
	    }
		targetAlarm = targetAlarmUpdate;	    
	    // console.log(gps);
	}
	catch(err) {
	    console.log('error in updateAllTargets',err.message,err);
	}
}

// save position
// keep up to 2880 positions (24 hours at 30 sec cadence)
function savePosition() {
	try {
		if (gps.lat !== undefined) {
			positions.unshift({
	            a: Math.round(gps.lat * 1e7),
	            o: Math.round(gps.lon * 1e7),
	            t: gps.time
			});
			
			if (positions.length > 2880) {
			    positions.length = 2880;
			}
		}
	
		if (autoAnchorProfile) {
			// most recent 10 positions
	    	var recentPositions = positions.slice(0,10);
	    	
	    	// don't evaluate movement until we have atleast 3 sequential positions
	    	if (recentPositions.length < 3) {
	    	    return;
	    	}
	    	
	    	recentPositions.forEach(function(position) {
	    	    position.latitude = position.a / 1e7;
	    	    position.longitude = position.o / 1e7;
	    	});
	    	
	    	// in nm
			//console.log('recentPositions',recentPositions);
	    	var dist = geolib.getPathLength(recentPositions) / 1582;
	    	var avgSpeed = dist / (recentPositions.length * savePositionInterval / 1000 / 3600);
	    	
	    	// if we are underway, and average speed is less than 0.25 knots, then
	        // consider us anchored
	    	if (anchorWatchControl.setAnchor == 0 && avgSpeed < 0.25) {
		    	console.log('dist and avgSpeed:',dist,avgSpeed,recentPositions.length,savePositionInterval, anchorWatchControl.setAnchor);
	            setAnchored();
	    	} 
	    	
	    	// if we are anchored, and more than 100 meters from the anchor,
	    	// then consider us underway
	    	if (anchorWatchControl.setAnchor == 1 && anchorWatchControl.distanceToAnchor > 100) {
		    	console.log('dist and avgSpeed:',dist,avgSpeed,recentPositions.length,savePositionInterval, anchorWatchControl.setAnchor);
	            setUnderway();
	    	}
		}
	}
	catch(err) {
	    console.log('error in savePosition',err.message,err,gps);
	}
	finally {
		// call this function again to save position on the desired interval (which varries)
		setTimeout(savePosition, savePositionInterval);
	}
	
}

// from: http://geomalgorithms.com/a07-_distance.html
function updateCpa(target) {
    if (gps.lat === undefined 
    	    || gps.lon === undefined
    	    || gps.sog === undefined
    	    || gps.cog === undefined
    	    || target.lat === undefined
    	    || target.lon === undefined
    	    || target.sog === undefined
    	    || target.cog === undefined) {
    	//console.log('cant calc cpa: missing data',target.mmsi);
        target.cpa = undefined;
        target.tcpa = undefined;
    	return;
    }
	
    // add x,y in meters
    addCoords(target);
	// add vx,vy in m/H
	addSpeed(target);

	// dv = Tr1.v - Tr2.v
	// this is relative speed
	var dv = {
            x: target.vx - gps.vx,
            y: target.vy - gps.vy,
	}
	
	var dv2 = dot(dv,dv);
	
	// guard against division by zero
	// the tracks are almost parallel
	// or there is almost no relative movement
	if (dv2 < 0.00000001) {
        // console.log('cant calc tcpa: ',target.mmsi);
        target.cpa = undefined;
        target.tcpa = undefined;
        return;
	}
	
	// w0 = Tr1.P0 - Tr2.P0
	// this is relative position
	var w0 = {
			x: (target.lon - gps.lon) * 111120 * Math.cos(gps.lat * Math.PI/180),
            y: (target.lat - gps.lat) * 111120,
	}
	
	// in hours
	var tcpa = -dot(w0,dv) / dv2;
	
	// if tcpa is in the past,
	// or if tcpa is more than 3 hours in the future
	// then dont calc cpa & tcpa
    if (!tcpa || tcpa < 0 || tcpa > 3) {
        // console.log('cant calc tcpa: ',target.mmsi);
        target.cpa = undefined;
        target.tcpa = undefined;
        return;
    }

	// Point P1 = Tr1.P0 + (ctime * Tr1.v);
	var p1 = {
            x: gps.x + tcpa*gps.vx,
            y: gps.y + tcpa*gps.vy,
	}
	
	// Point P2 = Tr2.P0 + (ctime * Tr2.v);
	var p2 = {
			x: target.x + tcpa*target.vx,
			y: target.y + tcpa*target.vy,
	}

	// in meters
	var cpa = dist(p1,p2);
	
	// convert to nm
	target.cpa = cpa/1852;
    
	// convert to secs
	target.tcpa = tcpa*3600;
}

// add x,y in m
function addCoords(target) {
	target.y = target.lat * 111120;
	target.x = target.lon * 111120 * Math.cos(gps.lat * Math.PI / 180);
}

// add vx,vy in m/H
function addSpeed(target) {
	target.vy = target.sog * Math.cos(target.cog * Math.PI / 180) * 1852;
	target.vx = target.sog * Math.sin(target.cog * Math.PI / 180) * 1852;
}

// #define dot(u,v) ((u).x * (v).x + (u).y * (v).y + (u).z * (v).z)
function dot(u,v) {
	return u.x * v.x + u.y * v.y;
}

// #define norm(v) sqrt(dot(v,v))
// norm = length of vector
function norm(v) {
	return Math.sqrt(dot(v,v));
}

// #define d(u,v) norm(u-v)
// distance = norm of difference
function dist(u,v) {
	return norm({
		x: u.x - v.x,
		y: u.y - v.y,
	});
}

function evaluateAlarms(target) {
	try {
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
	    
	    // alarm
	    if (target.guardAlarm 
	            || target.collisionAlarm 
	            || target.sartAlarm 
	            || target.mobAlarm 
	            || target.epirbAlarm) {
	        target.dangerState = 'danger';
	        target.filteredState = 'show';
	        target.order = 8190;
	        if (!target.alarmMuted) {
				console.log('collision alarm triggered for:',target);
				targetAlarmUpdate = true;
	        	//startAlarm();
	        }
	    }
	    // threat
	    else if (target.collisionWarning) {
	        // "warning" does not produce orange icons or alarms in the app, but
	        // "threat" does :)
	        target.dangerState = 'threat';
	        target.filteredState = 'show';
	        target.order = 16382;
	    }
	    // none
	    else {
	        target.dangerState = undefined;
	        target.filteredState = 'hide';
	        target.order = 36862;
	    }
	    
	    var alarms = [];
	
	    if (target.guardAlarm) alarms.push('guard');
	    if (target.collisionAlarm || target.collisionWarning) alarms.push('cpa');
	    if (target.sartAlarm) alarms.push('sart');
	    if (target.mobAlarm) alarms.push('mob');
	    if (target.epirbAlarm) alarms.push('epirb');
	
	    target.alarmType = alarms.join(',');
	
	    // sort sooner tcpa targets to top
	    if (target.tcpa > 0) {
	        // sort vessels with any tcpa above vessels that dont have a tcpa
	        target.order -= 1000;
	        // tcpa of 0 seconds reduces order by 1000 (this is an arbitrary
	        // weighting)
	        // tcpa of 60 minutes reduces order by 0
	        var weight = 1000;
	        target.order -= Math.max(0, Math.round(weight - weight*target.tcpa/3600));
	    }
	
	    // sort closer cpa targets to top
	    if (target.cpa > 0) {
	        // cpa of 0 nm reduces order by 2000 (this is an arbitrary weighting)
	        // cpa of 5 nm reduces order by 0
	        var weight = 2000;
	        target.order -= Math.max(0, Math.round(weight - weight*target.cpa/5));
	    }
	
	    // sort closer targets to top
	    if (target.range > 0) {
	        target.order += Math.round(100*target.range);
	    }
	
	    // sort targets with no range to bottom
	    if (target.range === undefined) {
	        target.order += 99999;
	    }
	}
	catch(err) {
	    console.log('error in evaluateAlarms',err.message);
	}
}

function formatCog(cog) {
    return cog === undefined ? '' : ('00' + Math.round(cog)).slice(-3);
}

function formatRot(rot) {
    // sample: 3°/min
    return rot === undefined || rot == 0 || rot == -128 ? '' : Math.round(Math.pow(rot/4.733,2)) + '°/min';
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
    // 1970-01-01T00:00:07.000Z
    if (tcpa === undefined || tcpa<0) {
        return '';
    } 
    // when more than 60 mins, then format hh:mm:ss
    else if (Math.abs(tcpa)>=3600) {
        return (tcpa<0 ? '-' : '') + new Date(1000 * Math.abs(tcpa)).toISOString().substr(11,8)
    } 
    // when less than 60 mins, then format mm:ss
    else {
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
        console.log(err);
    }
    return myObj;
}

function saveCollisionProfiles() {
    
    if (!saveCollisionProfilesEnabled) {
        return;
    }
    
    try {
        var data = JSON.stringify(collisionProfiles);
        fs.writeFile('./collisionProfiles.json', data, function (err) {
            if (err) {
                console.log('There has been an error saving your configuration data.');
                console.log(err);
                return;
            }
            console.log('Configuration saved successfully.')
        });
    }
    catch (err) {
        console.log('There has been an error saving your configuration data.')
        console.log(err);
    }
}

async function updateAnchorWatch() {
	
	try {
		//console.log('anchorWatchControl',anchorWatchControl,savePositionInterval);
		
		// if anchored, then record position every 30 secs
		// otherwise if underway, then record position every 2 secs
		savePositionInterval = (anchorWatchControl.setAnchor) ? savePositionIntervalWhenAnchored : savePositionIntervalWhenUnderway;
	
	    if (!anchorWatchControl.setAnchor) {
			anchorAlarm = false;
	        return;
	    }
	    
	    // in meters
	    anchorWatchControl.distanceToAnchor = geolib.getDistance(
	            {latitude: gps.lat, longitude: gps.lon},
	            {latitude: anchorWatchControl.anchorPosition.a / 1e7, longitude: anchorWatchControl.anchorPosition.o / 1e7}
	        );
	    
	    anchorWatchControl.bearingToAnchor = Math.round(geolib.getRhumbLineBearing(
	            {latitude: gps.lat, longitude: gps.lon},
	            {latitude: anchorWatchControl.anchorPosition.a / 1e7, longitude: anchorWatchControl.anchorPosition.o / 1e7}
	        ));
	
	    anchorWatchControl.alarmTriggered = (anchorWatchControl.distanceToAnchor > anchorWatchControl.alarmRadius) ? 1 : 0;

	    if (anchorWatchControl.alarmsEnabled == 1 && anchorWatchControl.alarmTriggered == 1) {
			console.log('anchor alarm triggered:',anchorWatchControl);
			anchorAlarm = true;
	    	//startAlarm();
	    } else {
			anchorAlarm = false;
		}
	}
	catch(err) {
	    console.log('error in updateAnchorWatch',err.message,err,anchorWatchControl,gps);
	}
}

async function manageAlarms() {
	// if there is an alarm condition
	if ( targetAlarm || anchorAlarm ) {
		// if the alarm is not active, then turn it on
		if (!alarm) {
			startAlarm();
		}
	} 
	// else (there is no alarm condition)
	else {
		// if the alarm is active, then turn it off	
		if (alarm) {
			stopAlarm();
		}
	}
}

function startAlarm() {
	if (!alarm) {
		console.log('startAlarm');
		// toggle led on and off every 500 ms
		alarm = setInterval(function() {
			try {
				var onOff = buzzer.readSync() ^ 1;
				//console.log('alarm!',onOff);
				buzzer.writeSync(onOff);
			}
		    catch (err) {
		        console.log('error in startAlarm',err);
		    }
		}, 500);
	}
}

function stopAlarm() {
	try {
		console.log('stopAlarm');
	    clearInterval(alarm);
		alarm = undefined;
	    buzzer.writeSync(0);
	}
    catch (err) {
        console.log('error in stopAlarm',err);
    }
}

function muteAlarms() {
    for (var mmsi in targets) {
        var target = targets[mmsi];
        if (target.dangerState === 'danger') {
            target.alarmMuted = true;
        }
    }
    
    // TODO: or should we just silence the anchor watch for 20 minutes? that
    // might be better
    if (anchorWatchControl.alarmsEnabled == 1 && anchorWatchControl.alarmTriggered == 1) {
    	anchorWatchControl.alarmsEnabled = 0;
    }
    
    // stop the mayhem
    stopAlarm();
}

function exit() {
	aisProxy.end();
    stopAlarm();
	buzzer.unexport();
	button.unexport();
	process.exit();
}
 
process.on('SIGINT', exit);
