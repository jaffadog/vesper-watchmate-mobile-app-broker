"use strict";

const express = require('express');
const app = express();

const net = require('net');
// const xml = require('xml');
const AisDecode  = require ("ggencoder").AisDecode;
const NmeaDecode = require ("ggencoder").NmeaDecode;
const geolib = require('geolib');
const x = require('lethexa-motionpredict');
const Magvar = require('magvar');

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
const ageOldTargetsTTL = 15;

const tcpPort = 39150;
const httpPort = 39151;

const aisHostname = '127.0.0.1';
const iasPort = 3000;

var targets = {};
var aisSession = {};

// $PVSP,DEVINFO,5.20.17443,XB6000H,NF14133,AI,05853001,3,2,7,,*2E..
// 5.20.17443 = connectedDeviceTxVersion
// XB6000H = connectedDeviceType
// NF14133 = connectedDeviceSerialNumber

var aisDeviceModel = {
	connectedDeviceType: 'vesper-watchmate-mobile-app-broker',
	connectedDeviceUiVersion: '---',
	connectedDeviceTxVersion: '---',
	connectedDeviceTxBbVersion: '---',
	connectedDeviceSerialNumber: '---'

// connectedDeviceType: 'XB-8000',
// connectedDeviceUiVersion: '3.04.17316',
// connectedDeviceTxVersion: '5.20.17443',
// connectedDeviceTxBbVersion: '1.2.4.0',
// connectedDeviceSerialNumber: 'KW37070'
};

// NEED SAMPLES OF:

// GET /datamodel/getModel?AnchorWatch
// GET /v3/openChannel
// GET /prefs/start_notifying
// GET /v3/subscribeChannel?Sensors
// GET /v3/subscribeChannel?HeartBeat
// GET /v3/subscribeChannel?AnchorWatch
// GET /v3/subscribeChannel?AnchorWatchControl
// GET /v3/subscribeChannel?VesselPositionUnderway
// GET /v3/subscribeChannel?VesselPositionHistory
// GET /alarms/mute_alarm
// TCP Server Received:$PVSP,KDGST,S*19
// TCP Server Received:$PVSP,QNEMOELEMS*23

// GET /prefs/setPreferences?profile.current=COASTAL
// GET /prefs/getPreferences?profile.current

// GET /v3/watchMate/collisionProfiles

// GET /datamodel/getModel?OwnStaticData
// OwnStaticData.vesselType
// OwnStaticData.mmsi
// OwnStaticData.name
// OwnStaticData.callSign


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

var gpsModel = {
    latitudeText: 'N 00° 00.0000',
    longitudeText: 'E 000° 00.0000',
    COG: '000',
    SOG: '0.0'
};

// FIXME: check if we can use hasGPS=0 while there is no fix
// so that we don't send any other gps data until we have a fix

// FIXME: age out old GPS fix data - i.e. older that 5 minutes and revert back
// to hasGPS=0 (no fix)

function getGpsModelXml() {
return `<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<GPSModel>
<hasGPS>1</hasGPS>
<latitudeText>${gpsModel.latitudeText||''}</latitudeText>
<longitudeText>${gpsModel.longitudeText||''}</longitudeText>
<COG>${formatCog(gpsModel.cog)}</COG>
<SOG>${formatSog(gpsModel.sog)}</SOG>
<HDGT>${formatCog(gpsModel.hdg)}</HDGT>
<magvar>${gpsModel.magvar||''}</magvar>
<hasBowPosition>0</hasBowPosition>
<sim>stop</sim>
</GPSModel>
</Watchmate>`
}

// var gpsModel = {
// latitudeText: 'N 39° 57.0689',
// longitudeText: 'W 075° 08.3692',
// COG: '090',
// SOG: '0.0'
// };

function getGpsModelAdvancedXml() {
	return `<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<GPSModel>
<hasGPS>1</hasGPS>
<latitudeText>${gpsModel.latitudeText||''}</latitudeText>
<longitudeText>${gpsModel.longitudeText||''}</longitudeText>
<COG>${formatCog(gpsModel.cog)}</COG>
<SOG>${formatSog(gpsModel.sog)}</SOG>
<HDGT>${formatCog(gpsModel.hdg)}</HDGT>
<magvar>${gpsModel.magvar||''}</magvar>
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
</Watchmate>`
}


// <anchorLatitude>39.951</anchorLatitude>
// <anchorLongitude>-75.14</anchorLongitude>

function getAnchorWatchModelXml() {
return `<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='1'>
<AnchorWatch>
<setAnchor>1</setAnchor>
<alarmRadius>30</alarmRadius>
<magneticOrTrueBearing>T</magneticOrTrueBearing>
<alarmsEnabled>0</alarmsEnabled>
<anchorLatitude>39.956</anchorLatitude>
<anchorLongitude>-75.145</anchorLongitude>
<outOfBounds>0</outOfBounds>
<usingCorrected>0</usingCorrected>
</AnchorWatch>
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
<Pref prefname='profile.current'>ANCHOR</Pref>
</Prefs>
</Watchmate>`;
}

function getAlarmsXml() {
    var response = 
`<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='1'>`;    

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
<TargetType></TargetType>
</Alarm>`;
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
<Watchmate version='1.0' priority='0'>`;	

    for (var mmsi in targets) {
	var target = targets[mmsi];
	response += 
`<Target>
<MMSI>${target.mmsi}</MMSI>
<Name>${target.name||''}</Name>
<CallSign>${target.callsign||''}</CallSign> 
<VesselTypeString>${target.VesselTypeString||''}</VesselTypeString>
<VesselType>${target.VesselType||''}</VesselType>
<TargetType>1</TargetType>
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
</Target>`;
    }

    response += '</Watchmate>';
    return response;
}

function getTargetDetails(mmsi) {
    var response = 
`<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>`;	

    var target = targets[mmsi];

    if (target !== undefined) {
	response += 
`<Target>
<IMO>0</IMO>
<COG>${formatCog(target.cog)}</COG>
<HDG>${formatCog(target.hdg)}</HDG>
<ROT></ROT>
<Altitude>-1</Altitude>
<LatitudeText>${target.latitudeText||''}</LatitudeText>
<LongitudeText>${target.longitudeText||''}</LongitudeText>
<OffPosition>0</OffPosition>
<Virtual>1</Virtual>
<Dimensions>---</Dimensions>
<Draft>---</Draft>
<ClassType>${target.classType||''}</ClassType>
<Destination></Destination>
<ETAText></ETAText>
<NavStatus>${target.navStatus||''}</NavStatus>
<MMSI>${mmsi||''}</MMSI>
<Name>${target.name||''}</Name>
<CallSign>${target.callsign||''}</CallSign> 
<VesselTypeString>${target.VesselTypeString||''}</VesselTypeString>
<VesselType>${target.VesselType||''}</VesselType>
<TargetType>1</TargetType>
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
</Target>`;
    }

    response += '</Watchmate>';
    return response;
}

// ======================= HTTP SERVER ========================
// listens to requests from mobile app

// log all requests
app.use(function(req, res, next) {
	console.info(`${req.method} ${req.originalUrl}`);
	// express.js automatically adds utf-8 encoding to everything. this
	// overrides that. the watchmate mobile app cannot deal with utf-8.
	res.setHeader('Content-Type', 'text/xml; charset=ISO-8859-1');
	next();
});

// sanity
app.get('/', (req, res) => res.send('Hello World!'));

// GET /datamodel/getModel?*****
app.get('/datamodel/getModel', (req, res) => {

    console.log(req.query);
    
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
    
    
    // 404
    else {
    	res.set('Content-Type', 'text/xml');
    	var xml = `<?xml version='1.0' encoding='ISO-8859-1' ?>
    		<Watchmate version='1.0' priority='0'>
    		</Watchmate>`; 
    	res.send( new Buffer(xml,'latin1') );
    }

});

// GET /prefs/getPreferences?accept.demo_mode&profile.current
app.get('/prefs/getPreferences', (req, res) => {
    res.send( new Buffer(getPreferencesXml(),'latin1') );
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

// catchall
app.get('*', function(req, res) {
    // res.set('Content-Type', 'text/xml');
    var xml = `<?xml version='1.0' encoding='ISO-8859-1' ?>
    	<Watchmate version='1.0' priority='0'>
    	</Watchmate>`; 
    res.send( new Buffer(xml,'latin1') );
});

app.listen(httpPort, () => console.log(`HTTP server listening on port ${httpPort}!`))

// ======================= TCP SERVER ========================
// listens to requests from mobile app

var tcpServer = net.createServer();

tcpServer.listen(tcpPort);
console.log('TCP Server listening on ' + tcpServer.address().address +':'+ tcpServer.address().port);

tcpServer.on('connection', function(socket) {
    console.log('New TCP Server Connection: ' + socket.remoteAddress +':'+ socket.remotePort);

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
    var timerId = setInterval(function(){
 var data =
 `$GPRMC,203538.00,A,3732.60174,N,07619.93740,W,0.047,77.90,201018,10.96,W,A*35
 $GPVTG,77.90,T,88.87,M,0.047,N,0.087,K,A*29
 $GPGGA,203538.00,3732.60174,N,07619.93740,W,1,06,1.48,-14.7,M,-35.6,M,,*79
 $GPGSA,A,3,21,32,10,24,20,15,,,,,,,2.96,1.48,2.56*00
 $GPGSV,2,1,08,08,03,314,31,10,46,313,39,15,35,057,36,20,74,341,35*71
 $GPGSV,2,2,08,21,53,204,41,24,58,079,32,27,,,35,32,28,257,36*4E
 $GPGLL,3732.60174,N,07619.93740,W,203538.00,A,A*75`;
 socket.write(data);
 }, 4000);

    socket.on('data', function(data) {
        var string = (data.toString());
        console.log('TCP Server Received:' + string)
    });

    socket.on('end', () => {
	clearInterval(timerId);
	console.log('TCP Server: client disconnected' + socket.remoteAddress +':'+ socket.remotePort);
    });
  
});

// ======================= TCP CLIENT ========================
// gets data from AIS

let client = new net.Socket()

// FIXME: humm... ok
client.setEncoding('latin1');

function connect() {
    console.log("new client");
    
    client.connect(iasPort, aisHostname, () => {
	console.log("Connected")
        // client.write("Hello, server! Love, Client.")
    });

    client.on("data", data => {
        console.log("Received: " + data);
        processReceivedAisData(data);
    });

    client.on("close", () => {
        console.log("Connection closed")
        reconnect()
    });

    client.on("end", () => {
        console.log("Connection ended")
        reconnect()
    });

    client.on("error", () => {
	// console.error;
        console.log("Connection refused")
    });
}

function processReceivedAisData(data) {
    var dataString = data.toString('latin1');
    var lines = dataString.split(/\r\n|\r|\n/g);
    
    for (var line of lines) {
	processAIScommand(line);
    }
}

function processAIScommand(line) {
    
    console.log('processAIScommand',line);

    // decode and AIS message
    if (line.startsWith('!AI')) { 
        var decMsg = new AisDecode (line, aisSession);
        console.log ('%j', decMsg);
        
        // !AIVDM,1,1,,A,H39WO5PpE8EE>0TT00000000000,2*28
        // User ID (MMSI) 211410710
        // Name NEREUS II@@@@@@@@@@@
        // {
        // "bitarray":[152,131,137,167,159,133,160,184,149,136,149,149,142,128,164,164,128,128,128,128,128,128,128,128,128,128,128],
        // "valid":true,
        // "error":"",
        // "payload":{
        // "type":"Buffer",
        // "data":[72,51,57,87,79,53,80,112,69,56,69,69,62,48,84,84,48,48,48,48,48,48,48,48,48,48,48]
        // },
        // "msglen":27,
        // "channel":"A",
        // "aistype":24,
        // "repeat":0,
        // "immsi":211410710,
        // "mmsi":"211410710",
        // "class":"B",
        // "part":0,
        // "shipname":"NEREUS II"
        // }
        
        // !AIVDM,1,1,,A,H39WO5TT@<CD9=?49>=j00000000,0*6D
        // {
        // "bitarray":[152,131,137,167,159,133,164,164,144,140,147,148,137,141,143,132,137,142,141,178,128,128,128,128,128,128,128,128],
        // "valid":true,
        // "error":"",
        // "payload":{
        // "type":"Buffer",
        // "data":[72,51,57,87,79,53,84,84,64,60,67,68,57,61,63,52,57,62,61,106,48,48,48,48,48,48,48,48]},
        // "msglen":28,
        // "channel":"A",
        // "aistype":24,
        // "repeat":0,
        // "immsi":211410710,
        // "mmsi":"211410710",
        // "class":"B",
        // "part":1,
        // "cargo":36,
        // "callsign":"DINM2",
        // "dimA":0,
        // "dimB":0,
        // "dimC":0,
        // "dimD":0,
        // "length":0,
        // "width":0
        // }
        
        // {
        // "bitarray":[129,133,158,137,169,175,128,160,128,128,154,162,165,168,172,149,159,136,159,171,138,143,190,188,130,148,128,151],
        // "valid":true,
        // "error":"",
        // "payload":{
        // "type":"Buffer",
        // "data":[49,53,78,57,97,103,48,80,48,48,74,82,85,96,100,69,79,56,79,99,58,63,118,116,50,68,48,71]
        // },
        // "msglen":28,
        // "channel":"B",
        // "aistype":1,
        // "repeat":0,
        // "immsi":367159740,
        // "mmsi":"367159740",
        // "class":"A",
        // "navstatus":0,
        // "lon":-76.33020333333333,
        // "lat":37.55029,
        // "rot":-128,
        // "sog":0,
        // "cog":285.6,
        // "hdg":511,
        // "utc":30,
        // "smi":0
        // }
        
        if (decMsg.valid && decMsg.mmsi) {
    	
    	var target = targets[decMsg.mmsi];
    	
    	console.log('target',target);
    	
    	if (!target) {
    	    target = {};
    	}

	target.mmsi = decMsg.mmsi;
	target.lastSeen = new Date().toISOString();

    	console.log('target',target);

    	if (decMsg.shipname !== undefined) {
    	    target.name = decMsg.shipname;
    	}
    	
    	if (decMsg.lat !== undefined) {
    	    target.lat = decMsg.lat;
    	    target.lon = decMsg.lon;
    	    target.latitudeText = formatLat(decMsg.lat);
    	    target.longitudeText = formatLon(decMsg.lon);
    	}
    	
        if (decMsg.cog !== undefined) {
            target.cog = decMsg.cog;
        }

        if (decMsg.hdg !== undefined) {
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
            target.navStatus = decMsg.navstatus;
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

    	targets[decMsg.mmsi] = target;

    	console.log('target',target);
    	console.log('targets',targets);

        }

    }
    
    // decode NMEA message
    if (line.startsWith('$GP')) {
        var decMsg = new NmeaDecode (line);
        console.log ('%j', decMsg);
        
        // {
        // "nmea":["$GPRMC","203901.00","A","3732.59922","N","07619.93996","W","0.018","77.90","201018","10.96","W","A*3D\n"],
        // "valid":true,
        // "cmd":2,
        // "mssi":0,
        // "time":"203901.00",
        // "lat":37.543320333333334,
        // "lon":-76.33233266666666,
        // "sog":0,
        // "cog":77.9,
        // "day":"201018",
        // "alt":10.96,
        // "date":1603053541000
        // }

        // var gpsModel = {
        // latitudeText: 'N 39° 57.0689',
        // longitudeText: 'W 075° 08.3692',
        // COG: '090',
        // SOG: '0.0'
        // };
		
	    // FIXME: add GPS accuracy and satellite data... meh
		
        if (decMsg.valid) {
            if (decMsg.lat !== undefined) {
            	gpsModel.lat = decMsg.lat;
            	gpsModel.lon = decMsg.lon;
            	gpsModel.latitudeText = formatLat(decMsg.lat);
            	gpsModel.longitudeText = formatLon(decMsg.lon);
            	gpsModel.magvar = Magvar.Get(gpsModel.lat, gpsModel.lon).toFixed(2);
            }
	
            if (decMsg.cog !== undefined) {
                gpsModel.cog = decMsg.cog;
            }

            if (decMsg.sog !== undefined) {
                gpsModel.sog = decMsg.sog;
            }

            console.log('gpsModel',gpsModel);
        }
        
    }
}

// do initial connection attempt to ais transponder
connect();

// try reconnect to the ais transponder if the connection drops
function reconnect() {
    setTimeout(() => {
        client.removeAllListeners(); 
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
    if (gpsModel.lat === undefined 
	    || gpsModel.lon === undefined
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
		    {latitude: gpsModel.lat, longitude: gpsModel.lon},
		    {latitude: target.lat, longitude: target.lon}
	    )
    );
    
    var bearing = Math.round(geolib.getRhumbLineBearing(
	    {latitude: gpsModel.lat, longitude: gpsModel.lon},
	    {latitude: target.lat, longitude: target.lon}
    ));
    
    target.range = range;
    target.bearing = bearing;
}

setInterval(updateAllTargets, 5000);

function updateAllTargets() {
    for (var mmsi in targets) {
    	var target = targets[mmsi];
    	// FIXME: age out old targets
    	ageOutOldTargets(target);
    	calculateRangeAndBearing(target);
    	updateCpa(target);
    	evaluateAlarms(target);
    }
}

function ageOutOldTargets(target) {
    if ( (new Date() - new Date(target.lastSeen))/1000/60 > ageOldTargetsTTL ) {
        console.log('deleting',target.mmsi,target.lastSeen,new Date().toISOString());
        delete targets[target.mmsi];
    }
}

function updateCpa(target) {
    if (gpsModel.lat === undefined 
	    || gpsModel.lon === undefined
	    || gpsModel.sog === undefined
	    || gpsModel.cog === undefined
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
    
     var position1 = [ gpsModel.lat, gpsModel.lon, 0 ];
     var velocity1 = generateSpeedVector(gpsModel.lat,gpsModel.sog,gpsModel.cog);
    
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
    target.guardAlarm = (target.range<2 && target.sog>1);
    
    // collision alarm
    target.collisionAlarm = (target.cpa<0.1 && target.tcpa<300 && target.sog>3);
        
    // collision warning
    target.collisionWarning = (target.cpa<0.5 && target.tcpa<600 && target.sog>0.5);

    if (target.guardAlarm || target.collisionAlarm) {
        target.dangerState = 'danger';
    }
    else if (target.collisionWarning) {
        target.dangerState = 'warning';
    }
    else {
        target.dangerState = undefined;
    }
    
    var alarmType = '';
    
    if (target.guardAlarm) {
        alarmType = 'guard';
    }

    if (target.collisionAlarm || target.collisionWarning) {
        alarmType += (alarmType ? ',' : '') + 'cpa';
    }
    
    target.alarmType = alarmType ? alarmType : undefined;

    var order = 10000;
    
    if (target.dangerState) {
        order -= 5000;
        target.filteredState = 'show';
    }
    else {
        target.filteredState = 'hide';
    }

    if (target.tcpa) {
        // tcpa of 0 seconds reduces order by 1000 (this is an arbitrary
        // weighting)
        // tcpa of 60 minutes reduces order by 0
        order -= (1000 - 1000/3600*(target.tcpa<0 ? 0 : target.tcpa));
    }

    if (target.cpa) {
        // cpa of 0 nm reduces order by 2000 (this is an arbitrary weighting)
        // cpa of 5 nm reduces order by 0
        order -= (1000 - 2000/5*(target.cpa<0 ? 0 : target.cpa));
    }

    if (target.sog) {
        // sog of 15 knots reduces order by 45 (this is an arbitrary weighting)
        order -= 3*target.sog;
    }
    
    target.order = Math.round(order);

}

function formatCog(cog) {
    return cog === undefined ? '' : ('00' + Math.round(cog)).slice(-3);
}

function formatSog(sog) {
    return sog === undefined ? '' : sog.toFixed(1);    
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
        return new Date(1000 * Math.abs(tcpa)).toISOString().substr(11,8)
    } else {
        return new Date(1000 * Math.abs(tcpa)).toISOString().substr(14,5)
    }
}

function formatRange(range) {
    return range === undefined ? '' : range.toFixed(2);
}

