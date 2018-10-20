const express = require('express')
const app = express()

// const port = 3000

// const http = require('http');

var net = require('net');
var xml = require('xml');

// const hostname = '127.0.0.1';
const hostname = '192.168.1.116';
const tcpPort = 39150;
const httpPort = 39151;

const aisHostname = '127.0.0.1';
const iasPort = 3000;

var aisDeviceModel = {
	connectedDeviceType: 'XB-8000',
	connectedDeviceUiVersion: '3.04.17316',
	connectedDeviceTxVersion: '5.20.17443',
	connectedDeviceTxBbVersion: '1.2.4.0',
	connectedDeviceSerialNumber: 'KW37070'
};

function getDeviceModelXml(aisDeviceModel) {
var deviceModelXml = {
	Watchmate: [{
		_attr: {
			version: '1.0',
			priority: '0'
		}
	}, {
		DeviceModel: [{
			connectedDeviceType: aisDeviceModel.connectedDeviceType
		}, {
			connectedDeviceUiVersion: aisDeviceModel.connectedDeviceUiVersion
		}, {
			connectedDeviceTxVersion: aisDeviceModel.connectedDeviceTxVersion
		}, {
			connectedDeviceTxBbVersion: aisDeviceModel.connectedDeviceTxBbVersion
		}, {
			connectedDeviceSerialNumber: aisDeviceModel.connectedDeviceSerialNumber
		}]
	}]
};
return xml(deviceModelXml, { declaration: true });
}

console.log(getDeviceModelXml(aisDeviceModel));

/* 
<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<DeviceModel>
<connectedDeviceType>XB-8000</connectedDeviceType>
<connectedDeviceUiVersion>3.04.17316</connectedDeviceUiVersion>
<connectedDeviceTxVersion>5.20.17443</connectedDeviceTxVersion>
<connectedDeviceTxBbVersion>1.2.4.0</connectedDeviceTxBbVersion>
<connectedDeviceSerialNumber>KW37070</connectedDeviceSerialNumber>
</DeviceModel>
</Watchmate>
*/

function deviceModelXml2() {
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

function getGpsModelXml() {
return `<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<latitudeText>10</latitudeText>
<longitudeText>20</longitudeText>
<COG>30</COG>
<SOG>5</SOG>
<metersAccuracy>3</metersAccuracy>
<HDOP>1</HDOP>
<sim></sim>
<magvar>1</magvar>
</Watchmate>`
}

function getTxStatusModelXml() {
return `<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<warnMMSI>false</warnMMSI>
<warnSilent>false</warnSilent>
<warnStartup>false</warnStartup>
<warnGPS>false</warnGPS>
<warnPosReportSent>false</warnPosReportSent>
<statusVSWR>1</statusVSWR>
<valueVSWR>1</valueVSWR>
<antennaInUse>false</antennaInUse>
<gpsSBAS>false</gpsSBAS>
<gpsSmooth>false</gpsSmooth>
<nmeaInBaud>4800</nmeaInBaud>
<nmeaOutBaud>38400</nmeaOutBaud>
<externalAlarm>false</externalAlarm>
<frequency>111</frequency>
<mode>1</mode>
<rssi>100</rssi>
<rxCount>1</rxCount>
<txCount>2</txCount>
<n2kBus>1</n2kBus>
<n2kPosRate>1</n2kPosRate>
<n2kCogRate>1</n2kCogRate>
<nmeaEcho>false</nmeaEcho>
<gpsFastUpdate>false</gpsFastUpdate>
<nmeaEchoAIS>false</nmeaEchoAIS>
<nmeaEchoGPS>false</nmeaEchoGPS>
<nmeaEchoN2K>false</nmeaEchoN2K>
<nmeaEchoNMEA>false</nmeaEchoNMEA>
<extSwitchFunc>1</extSwitchFunc>
<nmeaEchoVDO>false</nmeaEchoVDO>
<extSwitchState>false</extSwitchState>
</Watchmate>`
}

var aisPreferences = {
	
}

function getPreferencesXml() {
return `<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<Prefs>
<PrefsRequested>
{2,{\"accept.demo_mode\",\"\"},{\"profile.current\",\"\"}}
</PrefsRequested>
<Pref prefname='accept.demo_mode'>0</Pref>
<Pref prefname='profile.current'>ANCHOR</Pref>
</Prefs>
</Watchmate>`;
}

/* 
<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<Prefs>
<PrefsRequested>
{2,{"accept.demo_mode",""},{"profile.current",""}}
</PrefsRequested>
<Pref prefname='accept.demo_mode'>0</Pref>
<Pref prefname='profile.current'>ANCHOR</Pref>
</Prefs>
</Watchmate>
 */

function getAlarmsXml() {
return `<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<Alarm MMSI='255805923' state='danger' type='guard'>
<Name></Name>
<COG></COG>
<SOG></SOG>
<CPA></CPA>
<TCPA></TCPA>
<Range>3.16</Range>
<BearingTrue>177</BearingTrue>
<TargetType></TargetType>
</Alarm>
</Watchmate>`
}

/* 
<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='1'>
<Alarm MMSI='255805923' state='danger' type='guard'>
<Name></Name>
<COG></COG>
<SOG></SOG>
<CPA></CPA>
<TCPA></TCPA>
<Range>3.16</Range>
<BearingTrue>177</BearingTrue>
<TargetType></TargetType>
</Alarm>
<Alarm MMSI='256850000' state='danger' type='guard'>
<Name></Name>
<COG></COG>
<SOG></SOG>
<CPA></CPA>
<TCPA></TCPA>
<Range>3.19</Range>
<BearingTrue>058</BearingTrue>
<TargetType></TargetType>
</Alarm>
</Watchmate>
 */

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

/* 
<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<SimFiles>
<simfile>TamakiStrait.sim</simfile>
<simfile>TamakiStraitMOB.sim</simfile>
<simfile>VirginIslands.sim</simfile>
<simfile>AnchorWatch.sim</simfile>
<simfile>stop</simfile>
</SimFiles>
<sim>stop</sim>
</Watchmate>
 */

function getTargetsXml() {
return `<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<Target>
<MMSI>255805923</MMSI>
<Name></Name>
<CallSign></CallSign>
<VesselTypeString>Type not available</VesselTypeString>
<VesselType>0</VesselType>
<TargetType>1</TargetType>
<Order>8190</Order>
<TCPA></TCPA>
<CPA></CPA>
<Bearing>177</Bearing>
<Range>3.16</Range>
<COG2>146</COG2>
<SOG>0.0</SOG>
<DangerState>danger</DangerState>
<AlarmType>guard</AlarmType>
<FilteredState>show</FilteredState>
</Target>
</Watchmate>`
}

/* 
<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>
<Target>
<MMSI>255805923</MMSI>
<Name></Name>
<CallSign></CallSign>
<VesselTypeString>Type not available</VesselTypeString>
<VesselType>0</VesselType>
<TargetType>1</TargetType>
<Order>8190</Order>
<TCPA></TCPA>
<CPA></CPA>
<Bearing>177</Bearing>
<Range>3.16</Range>
<COG2>146</COG2>
<SOG>0.0</SOG>
<DangerState>danger</DangerState>
<AlarmType>guard</AlarmType>
<FilteredState>show</FilteredState>
</Target>
</Watchmate>
 */


// ======================= HTTP SERVER ========================
// listens to requests from mobile app

app.use(function(req, res, next) {
	console.info(`${req.method} ${req.originalUrl}`);
	next();
});

app.get('/', (req, res) => res.send('Hello World!'));

// deviceModel.connectedDeviceType = 'ribbit';

app.get('/datamodel/getModel', (req, res) => {

	console.log(req.query);

	res.set('Content-Type', 'text/xml');
	
	// DeviceModel
	if (req.query.DeviceModel==='') {
		res.send( getDeviceModelXml(aisDeviceModel) );
	} 
	
	// GPSModel
	else if (req.query.GPSModel==='') {
		res.send( getGpsModelXml() );
	} 
	
	// GET /datamodel/getModel?TxStatus
	else if (req.query.GPSModel==='') {
		res.send( getTxStatusModelXml() );
	} 

	
	// 404
	else {
		res.send('idk man');
	}

});

app.get('/prefs/getPreferences', (req, res) => {
	res.set('Content-Type', 'text/xml');
	res.send(getPreferencesXml());
});

app.get('/alarms/get_current_list', (req, res) => {
	res.set('Content-Type', 'text/xml');
	res.send(getAlarmsXml());
});

app.get('/test/getSimFiles', (req, res) => {
	res.set('Content-Type', 'text/xml');
	res.send(getSimsXml());
});

app.get('/targets/getTargets', (req, res) => {
	res.set('Content-Type', 'text/xml');
	res.send(getTargetsXml());
});

// GET /targets/getTargetDetails?MMSI=255805923
app.get('/targets/getTargetDetails', (req, res) => {
	res.set('Content-Type', 'text/xml');
	res.send(getTargetsXml());
});


app.listen(httpPort, () => console.log(`Example app listening on port ${httpPort}!`))

/* 
const httpServer = http.createServer((req, res) => {
  console.log('HTTP Server Received: ',req.url);  
  if (req.url==='/datamodel/getModel?DeviceModel') {	
  }
  else {
  	res.statusCode = 404;
  	res.setHeader('Content-Type', 'text/plain');
  	res.end('Not Found\n');
  }
});

httpServer.listen(httpPort, hostname, () => {
  console.log(`HTTP Server running at http://${hostname}:${httpPort}/`);
});

function sendHttpResponse() {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello World\n');
}
 */

// ======================= TCP SERVER ========================
// listens to requests from mobile app

var tcpServer = net.createServer(function(socket) {
	// socket.write('Echo server\r\n');
	// socket.pipe(socket);

    socket.on('data', function(data) {
      var string = (data.toString());
      console.log('TCP Server Received:' + string)
    });

	socket.on('end', () => {
    	console.log('TCP Server: client disconnected');
  	});
  
});

tcpServer.listen(tcpPort, hostname);

// ======================= TCP CLIENT ========================
// gets data from AIS

/* 
var client = new net.Socket();

client.connect(iasPort, aisHostname, function() {
	console.log('TCP Client Connected');
	client.write('Hello, server! Love, Client.');
});

client.on('data', function(data) {
	console.log('TCP Client Received: ' + data);
	client.destroy(); // kill client after server's response
});

client.on('close', function() {
	console.log('TCP Client: Connection closed');
});
 */
