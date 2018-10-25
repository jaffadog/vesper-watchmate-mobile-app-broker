"use strict";

const express = require('express')
const app = express()

const net = require('net');
const xml = require('xml');
const AisDecode  = require ("ggencoder").AisDecode;
const NmeaDecode = require ("ggencoder").NmeaDecode;
const geolib = require('geolib');
const x = require('lethexa-motionpredict');
const Magvar = require('magvar');

const tcpPort = 39150;
const httpPort = 39151;

const aisHostname = '127.0.0.1';
const iasPort = 3000;

var targets = {};
var aisSession = {};

var aisDeviceModel = {
	connectedDeviceType: 'XB-8000',
	connectedDeviceUiVersion: '3.04.17316',
	connectedDeviceTxVersion: '5.20.17443',
	connectedDeviceTxBbVersion: '1.2.4.0',
	connectedDeviceSerialNumber: 'KW37070'
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




// function getDeviceModelXml(aisDeviceModel) {
// var deviceModelXml = {
// Watchmate: [{
// _attr: {
// version: '1.0',
// priority: '0'
// }
// }, {
// DeviceModel: [{
// connectedDeviceType: aisDeviceModel.connectedDeviceType
// }, {
// connectedDeviceUiVersion: aisDeviceModel.connectedDeviceUiVersion
// }, {
// connectedDeviceTxVersion: aisDeviceModel.connectedDeviceTxVersion
// }, {
// connectedDeviceTxBbVersion: aisDeviceModel.connectedDeviceTxBbVersion
// }, {
// connectedDeviceSerialNumber: aisDeviceModel.connectedDeviceSerialNumber
// }]
// }]
// };
// return xml(deviceModelXml, { declaration: true });
// }
//
// console.log(getDeviceModelXml(aisDeviceModel));

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
<COG>${gpsModel.COG||''}</COG>
<SOG>${gpsModel.SOG||''}</SOG>
<HDGT></HDGT>
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
<COG>${gpsModel.COG||''}</COG>
<SOG>${gpsModel.SOG||''}</SOG>
<HDGT></HDGT>
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
return `<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='1'>
</Watchmate>`;

// <?xml version='1.0' encoding='ISO-8859-1' ?>
// <Watchmate version='1.0' priority='1'>
// <Alarm MMSI='256850000' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>3.19</Range>
// <BearingTrue>058</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// </Watchmate>

// <Alarm MMSI='993672159' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>3.16</Range>
// <BearingTrue>177</BearingTrue>
// <TargetType></TargetType>
// </Alarm>


	
// return `<?xml version='1.0' encoding='ISO-8859-1' ?>
// <Watchmate version='1.0' priority='1'>
// <Alarm MMSI='255805923' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>3.16</Range>
// <BearingTrue>177</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// </Watchmate>`

// <Alarm MMSI='256850000' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>3.19</Range>
// <BearingTrue>058</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='338211341' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>0.48</Range>
// <BearingTrue>185</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='338447000' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>5.95</Range>
// <BearingTrue>216</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='338737000' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>2.77</Range>
// <BearingTrue>055</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='338997000' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>5.15</Range>
// <BearingTrue>213</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='352610000' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>2.78</Range>
// <BearingTrue>168</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='366855710' state='danger' type='guard,cpa'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>1.21</Range>
// <BearingTrue>174</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='366939770' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>1.16</Range>
// <BearingTrue>170</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='366966060' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA>1.71</CPA>
// <TCPA>6:52:48</TCPA>
// <Range>2.12</Range>
// <BearingTrue>069</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='367061610' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>4.39</Range>
// <BearingTrue>188</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='367097920' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA>2.05</CPA>
// <TCPA>1:19:18</TCPA>
// <Range>5.50</Range>
// <BearingTrue>213</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='367141210' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>0.98</Range>
// <BearingTrue>186</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='367148870' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>0.57</Range>
// <BearingTrue>187</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='367315470' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>2.82</Range>
// <BearingTrue>055</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='367318760' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>4.32</Range>
// <BearingTrue>215</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='367379670' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>4.23</Range>
// <BearingTrue>219</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='367428270' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>4.24</Range>
// <BearingTrue>214</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='367552410' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>4.28</Range>
// <BearingTrue>204</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='367571980' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>0.51</Range>
// <BearingTrue>143</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='367741150' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>3.01</Range>
// <BearingTrue>175</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='440371000' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>2.88</Range>
// <BearingTrue>174</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='477168200' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>1.87</Range>
// <BearingTrue>176</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='477333300' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>1.15</Range>
// <BearingTrue>173</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='564045000' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>2.43</Range>
// <BearingTrue>051</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='636018470' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>2.18</Range>
// <BearingTrue>165</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='636092827' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>3.01</Range>
// <BearingTrue>176</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// <Alarm MMSI='993663001' state='danger' type='guard'>
// <Name></Name>
// <COG></COG>
// <SOG></SOG>
// <CPA></CPA>
// <TCPA></TCPA>
// <Range>3.81</Range>
// <BearingTrue>062</BearingTrue>
// <TargetType></TargetType>
// </Alarm>
// </Watchmate>`
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

    console.log('targets',targets);
    
    for (var mmsi in targets) {
	var target = targets[mmsi];
	console.log('target',target);
	response += 
`<Target>
<MMSI>${target.MMSI}</MMSI>
<Name>${target.Name||''}</Name>
<CallSign></CallSign> 
<VesselTypeString>${target.VesselTypeString||''}</VesselTypeString>
<VesselType>${target.VesselType||''}</VesselType>
<TargetType>1</TargetType>
<Order>8190</Order>
<TCPA></TCPA>
<CPA></CPA>
<Bearing>${target.Bearing||''}</Bearing>
<Range>${target.Range||''}</Range>
<COG2>${target.COG2||''}</COG2>
<SOG>${target.SOG||''}</SOG>
<DangerState>danger</DangerState>
<AlarmType>guard</AlarmType>
<FilteredState>show</FilteredState>
</Target>`;
		
	// warning danger guard
	// DangerState: danger, ???
	// AlarmType: guard, ????
	// FilteredState: show, hide
    }

    response += '</Watchmate>';
    return response;

// return `<?xml version='1.0' encoding='ISO-8859-1' ?>
// <Watchmate version='1.0' priority='0'>
// <Target>
// <MMSI>993672159</MMSI>
// <Name>14</Name>
// <CallSign></CallSign>
// <VesselTypeString>Beacon: Starboard hand</VesselTypeString>
// <VesselType>14</VesselType>
// <TargetType>4</TargetType>
// <Order>36862</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>216</Bearing>
// <Range>28.2</Range>
// <COG2></COG2>
// <SOG></SOG>
// <DangerState></DangerState>
// <AlarmType></AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// </Watchmate>`
	
// return `<?xml version='1.0' encoding='ISO-8859-1' ?>
// <Watchmate version='1.0' priority='0'>
// <Target>
// <MMSI>255805923</MMSI>
// <Name>Ribbit</Name>
// <CallSign></CallSign>
// <VesselTypeString>Type not available</VesselTypeString>
// <VesselType>0</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>177</Bearing>
// <Range>3.16</Range>
// <COG2>146</COG2>
// <SOG>0.0</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// </Watchmate>`

// <Target>
// <MMSI>256850000</MMSI>
// <Name>ATLANTIC NAVIGATORII</Name>
// <CallSign>9HA4023</CallSign>
// <VesselTypeString>Cargo</VesselTypeString>
// <VesselType>79</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>058</Bearing>
// <Range>3.19</Range>
// <COG2>257</COG2>
// <SOG>0.0</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>338211341</MMSI>
// <Name>SEA FOX</Name>
// <CallSign></CallSign>
// <VesselTypeString>Pleasure craft</VesselTypeString>
// <VesselType>37</VesselType>
// <TargetType>2</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>185</Bearing>
// <Range>0.48</Range>
// <COG2>287</COG2>
// <SOG>0.0</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>338447000</MMSI>
// <Name></Name>
// <CallSign></CallSign>
// <VesselTypeString>Type not available</VesselTypeString>
// <VesselType>0</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>216</Bearing>
// <Range>5.95</Range>
// <COG2>343</COG2>
// <SOG>0.1</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>338737000</MMSI>
// <Name>OCEAN WIND</Name>
// <CallSign>WDG5141</CallSign>
// <VesselTypeString>Tug</VesselTypeString>
// <VesselType>52</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>055</Bearing>
// <Range>2.77</Range>
// <COG2>007</COG2>
// <SOG>0.0</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>338997000</MMSI>
// <Name>MCFARLAND</Name>
// <CallSign>AEGB</CallSign>
// <VesselTypeString>Dredging</VesselTypeString>
// <VesselType>33</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>213</Bearing>
// <Range>5.15</Range>
// <COG2>359</COG2>
// <SOG>0.0</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>352610000</MMSI>
// <Name>MARBELLA CARRIER</Name>
// <CallSign>3FJE9</CallSign>
// <VesselTypeString>Cargo</VesselTypeString>
// <VesselType>70</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>168</Bearing>
// <Range>2.78</Range>
// <COG2>026</COG2>
// <SOG>0.0</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>366855710</MMSI>
// <Name>GRAMMA LEE T MORAN</Name>
// <CallSign>WDA8564</CallSign>
// <VesselTypeString>Tug</VesselTypeString>
// <VesselType>52</VesselType>
// <TargetType>1</TargetType>
// <Order>4188</Order>
// <TCPA>11:27</TCPA>
// <CPA>0.00</CPA>
// <Bearing>175</Bearing>
// <Range>1.39</Range>
// <COG2>355</COG2>
// <SOG>7.3</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard,cpa</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>366939770</MMSI>
// <Name>CAPE COD</Name>
// <CallSign>WBK3243</CallSign>
// <VesselTypeString>Tug</VesselTypeString>
// <VesselType>52</VesselType>
// <TargetType>1</TargetType>
// <Order>8188</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>171</Bearing>
// <Range>2.69</Range>
// <COG2>184</COG2>
// <SOG>9.9</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>366966060</MMSI>
// <Name>CONSORT</Name>
// <CallSign>WSQ3331</CallSign>
// <VesselTypeString>Towing</VesselTypeString>
// <VesselType>31</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>069</Bearing>
// <Range>2.12</Range>
// <COG2>015</COG2>
// <SOG>0.1</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>367061610</MMSI>
// <Name>BARNEY TURECAMO</Name>
// <CallSign>WDC6808</CallSign>
// <VesselTypeString>Local (57)</VesselTypeString>
// <VesselType>57</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>188</Bearing>
// <Range>4.39</Range>
// <COG2>342</COG2>
// <SOG>0.0</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>367061730</MMSI>
// <Name></Name>
// <CallSign></CallSign>
// <VesselTypeString>Type not available</VesselTypeString>
// <VesselType>0</VesselType>
// <TargetType>1</TargetType>
// <Order>36862</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>215</Bearing>
// <Range>7.11</Range>
// <COG2>207</COG2>
// <SOG>0.1</SOG>
// <DangerState></DangerState>
// <AlarmType></AlarmType>
// <FilteredState>hide</FilteredState>
// </Target>
// <Target>
// <MMSI>367097920</MMSI>
// <Name></Name>
// <CallSign></CallSign>
// <VesselTypeString>Type not available</VesselTypeString>
// <VesselType>0</VesselType>
// <TargetType>1</TargetType>
// <Order>5500</Order>
// <TCPA>48:53</TCPA>
// <CPA>0.96</CPA>
// <Bearing>212</Bearing>
// <Range>4.89</Range>
// <COG2>021</COG2>
// <SOG>5.9</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>367141210</MMSI>
// <Name>PILOT DELAWARE</Name>
// <CallSign>WDD4172</CallSign>
// <VesselTypeString>Pilot</VesselTypeString>
// <VesselType>50</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>186</Bearing>
// <Range>0.98</Range>
// <COG2>178</COG2>
// <SOG>0.1</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>367148870</MMSI>
// <Name>FREEDOM ELITE</Name>
// <CallSign>WDD4775</CallSign>
// <VesselTypeString>Passenger</VesselTypeString>
// <VesselType>69</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>186</Bearing>
// <Range>0.57</Range>
// <COG2>032</COG2>
// <SOG>0.0</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>367315470</MMSI>
// <Name>MARY M.COPPEDGE</Name>
// <CallSign>WDD9722</CallSign>
// <VesselTypeString>Other type</VesselTypeString>
// <VesselType>90</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>055</Bearing>
// <Range>2.83</Range>
// <COG2>050</COG2>
// <SOG>0.0</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>367318760</MMSI>
// <Name></Name>
// <CallSign></CallSign>
// <VesselTypeString>Type not available</VesselTypeString>
// <VesselType>0</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>215</Bearing>
// <Range>4.32</Range>
// <COG2>000</COG2>
// <SOG>0.0</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>367379670</MMSI>
// <Name></Name>
// <CallSign></CallSign>
// <VesselTypeString>Type not available</VesselTypeString>
// <VesselType>0</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>219</Bearing>
// <Range>4.23</Range>
// <COG2>277</COG2>
// <SOG>0.0</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>367552410</MMSI>
// <Name></Name>
// <CallSign></CallSign>
// <VesselTypeString>Type not available</VesselTypeString>
// <VesselType>0</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>204</Bearing>
// <Range>4.28</Range>
// <COG2>205</COG2>
// <SOG>0.0</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>367571980</MMSI>
// <Name>FREEDOM</Name>
// <CallSign>WDG7901</CallSign>
// <VesselTypeString>Type not available</VesselTypeString>
// <VesselType>0</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>143</Bearing>
// <Range>0.52</Range>
// <COG2></COG2>
// <SOG>0.0</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>367741150</MMSI>
// <Name>DR MILTON WANER</Name>
// <CallSign>WDI8688</CallSign>
// <VesselTypeString>Towing (&gt;200m)</VesselTypeString>
// <VesselType>32</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>176</Bearing>
// <Range>3.03</Range>
// <COG2>231</COG2>
// <SOG>0.2</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>440371000</MMSI>
// <Name>ASIAN CAPTAIN</Name>
// <CallSign>D7AQ</CallSign>
// <VesselTypeString>Type not available</VesselTypeString>
// <VesselType>70</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>174</Bearing>
// <Range>2.89</Range>
// <COG2>315</COG2>
// <SOG>0.0</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>477168200</MMSI>
// <Name>GREAT AGILITY</Name>
// <CallSign>VRQB3</CallSign>
// <VesselTypeString>Type not available</VesselTypeString>
// <VesselType>70</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>176</Bearing>
// <Range>1.87</Range>
// <COG2>268</COG2>
// <SOG>0.0</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>477333300</MMSI>
// <Name>PAQUETA ISLAND</Name>
// <CallSign>VRQO8</CallSign>
// <VesselTypeString>Cargo</VesselTypeString>
// <VesselType>70</VesselType>
// <TargetType>1</TargetType>
// <Order>8188</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>173</Bearing>
// <Range>1.71</Range>
// <COG2>159</COG2>
// <SOG>5.7</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>564045000</MMSI>
// <Name>MTM SAVANNAH</Name>
// <CallSign>9V2995</CallSign>
// <VesselTypeString>Tanker</VesselTypeString>
// <VesselType>80</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>051</Bearing>
// <Range>2.43</Range>
// <COG2>250</COG2>
// <SOG>0.0</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>636018470</MMSI>
// <Name>CHARADE</Name>
// <CallSign>D5PV2</CallSign>
// <VesselTypeString>Cargo</VesselTypeString>
// <VesselType>70</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>165</Bearing>
// <Range>2.18</Range>
// <COG2>283</COG2>
// <SOG>0.0</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>636092827</MMSI>
// <Name>MAERSK WOLFSBURG</Name>
// <CallSign>D5PZ5</CallSign>
// <VesselTypeString>Cargo</VesselTypeString>
// <VesselType>70</VesselType>
// <TargetType>1</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>176</Bearing>
// <Range>3.00</Range>
// <COG2>245</COG2>
// <SOG>0.0</SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>993663001</MMSI>
// <Name>DELAIR BRG-CLOSED</Name>
// <CallSign></CallSign>
// <VesselTypeString>Aid to navigation</VesselTypeString>
// <VesselType>0</VesselType>
// <TargetType>4</TargetType>
// <Order>8190</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>062</Bearing>
// <Range>3.82</Range>
// <COG2></COG2>
// <SOG></SOG>
// <DangerState>danger</DangerState>
// <AlarmType>guard</AlarmType>
// <FilteredState>show</FilteredState>
// </Target>
// <Target>
// <MMSI>993672077</MMSI>
// <Name>11</Name>
// <CallSign></CallSign>
// <VesselTypeString>Port hand mark</VesselTypeString>
// <VesselType>24</VesselType>
// <TargetType>4</TargetType>
// <Order>36862</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>218</Bearing>
// <Range>30.4</Range>
// <COG2></COG2>
// <SOG></SOG>
// <DangerState></DangerState>
// <AlarmType></AlarmType>
// <FilteredState>hide</FilteredState>
// </Target>
// <Target>
// <MMSI>993672078</MMSI>
// <Name>13</Name>
// <CallSign></CallSign>
// <VesselTypeString>Beacon: Port hand</VesselTypeString>
// <VesselType>13</VesselType>
// <TargetType>4</TargetType>
// <Order>36862</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>220</Bearing>
// <Range>29.8</Range>
// <COG2></COG2>
// <SOG></SOG>
// <DangerState></DangerState>
// <AlarmType></AlarmType>
// <FilteredState>hide</FilteredState>
// </Target>
// <Target>
// <MMSI>993672079</MMSI>
// <Name>CD</Name>
// <CallSign></CallSign>
// <VesselTypeString>Channel starboard hand mark</VesselTypeString>
// <VesselType>27</VesselType>
// <TargetType>4</TargetType>
// <Order>36862</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>220</Bearing>
// <Range>30.1</Range>
// <COG2></COG2>
// <SOG></SOG>
// <DangerState></DangerState>
// <AlarmType></AlarmType>
// <FilteredState>hide</FilteredState>
// </Target>
// <Target>
// <MMSI>993672159</MMSI>
// <Name>14</Name>
// <CallSign></CallSign>
// <VesselTypeString>Beacon: Starboard hand</VesselTypeString>
// <VesselType>14</VesselType>
// <TargetType>4</TargetType>
// <Order>36862</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>216</Bearing>
// <Range>28.2</Range>
// <COG2></COG2>
// <SOG></SOG>
// <DangerState></DangerState>
// <AlarmType></AlarmType>
// <FilteredState>hide</FilteredState>
// </Target>
// <Target>
// <MMSI>993672632</MMSI>
// <Name>WR62</Name>
// <CallSign></CallSign>
// <VesselTypeString>Starboard hand mark</VesselTypeString>
// <VesselType>25</VesselType>
// <TargetType>4</TargetType>
// <Order>36862</Order>
// <TCPA></TCPA>
// <CPA></CPA>
// <Bearing>215</Bearing>
// <Range>6.28</Range>
// <COG2></COG2>
// <SOG></SOG>
// <DangerState></DangerState>
// <AlarmType></AlarmType>
// <FilteredState>hide</FilteredState>
// </Target>
// </Watchmate>`
}

// var target = {
// MMSI: '256850000',
// Name: 'ATLANTIC NAVIGATORII',
// latitudeText: 'N 39° 57.0689',
// longitudeText: 'W 075° 08.3692',
// COG2: '090',
// SOG: '0.0',
// VesselTypeString: '',
// VesselType: '',
// TargetType: '',
// };


function getTargetDetails(mmsi) {
    var response = 
`<?xml version='1.0' encoding='ISO-8859-1' ?>
<Watchmate version='1.0' priority='0'>`;	

    var target = targets[mmsi];

    if (target !== undefined) {
	response += 
`<Target>
<IMO>0</IMO>
<COG>${target.COG2||''}</COG>
<HDG></HDG>
<ROT></ROT>
<Altitude>-1</Altitude>
<LatitudeText>${target.latitudeText||''}</LatitudeText>
<LongitudeText>${target.longitudeText||''}</LongitudeText>
<OffPosition>0</OffPosition>
<Virtual>1</Virtual>
<Dimensions>---</Dimensions>
<Draft>---</Draft>
<ClassType>ATON</ClassType>
<Destination></Destination>
<ETAText></ETAText>
<NavStatus>15</NavStatus>
<MMSI>${mmsi||''}</MMSI>
<Name>${target.Name||''}</Name>
<CallSign></CallSign> 
<VesselTypeString>${target.VesselTypeString||''}</VesselTypeString>
<VesselType>${target.VesselType||''}</VesselType>
<TargetType>1</TargetType>
<Order>8190</Order>
<TCPA></TCPA>
<CPA></CPA>
<Bearing>${target.Bearing||''}</Bearing>
<Range>${target.Range||''}</Range>
<COG2>${target.COG2||''}</COG2>
<SOG>${target.SOG||''}</SOG>
<DangerState>danger</DangerState>
<AlarmType>guard</AlarmType>
<FilteredState>show</FilteredState>
</Target>`

	//    <COG>${target.COG2||''}</COG>
	//    <HDG>30</HDG>

	// DangerState: danger, ???
	// AlarmType: guard, ????
	// FilteredState: show, hide
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

    // socket.write('Echo server');
    // socket.pipe(socket);

    socket.on('data', function(data) {
        var string = (data.toString());
        console.log('TCP Server Received:' + string)

        // var data =
        // `$GPRMC,203538.00,A,3732.60174,N,07619.93740,W,0.047,77.90,201018,10.96,W,A*35
        // $GPVTG,77.90,T,88.87,M,0.047,N,0.087,K,A*29
        // $GPGGA,203538.00,3732.60174,N,07619.93740,W,1,06,1.48,-14.7,M,-35.6,M,,*79
        // $GPGSA,A,3,21,32,10,24,20,15,,,,,,,2.96,1.48,2.56*00
        // $GPGSV,2,1,08,08,03,314,31,10,46,313,39,15,35,057,36,20,74,341,35*71
        // $GPGSV,2,2,08,21,53,204,41,24,58,079,32,27,,,35,32,28,257,36*4E
        // $GPGLL,3732.60174,N,07619.93740,W,203538.00,A,A*75`;
        // socket.write(data);

    });

    socket.on('end', () => {
	clearInterval(timerId);
	console.log('TCP Server: client disconnected' + socket.remoteAddress +':'+ socket.remotePort);
    });

  
});


// ======================= TCP CLIENT ========================
// gets data from AIS


let client = new net.Socket()

// FIXME:
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
        
        // for each target, we need to be able to access them by mmsi (key)
        // we need to store when we last saw the target
        // we need to age out old targets
        // we need to periodically calculate/evaluate cpa, tcpa, bearing,
	    // range, dangerstate, alarmtype
        
        // data structure probably should be something like:
        // targets = {}
        // target[mmsi] = {
        // name: xyz
        // latitudeText
        // longitudeText
        // COG2
        // SOG
        //
        // }
        
        if (decMsg.valid && decMsg.mmsi) {
    	
    	var target = targets[decMsg.mmsi];
    	
    	console.log('target',target);
    	
    	if (!target) {
    	    target = {};
    	}

		target.MMSI = decMsg.mmsi;

    	console.log('target',target);

    	// var target = {
// MMSI: '',
// Name: '',
// latitudeText: '',
// longitudeText: '',
// COG2: '',
// SOG: '',
// VesselTypeString: '',
// VesselType: '',
// TargetType: '',
// };

    	if (decMsg.shipname !== undefined) {
    	    target.Name = decMsg.shipname;
    	}
    	
    	if (decMsg.lat !== undefined) {
    	    target.lat = decMsg.lat;
    	    target.lon = decMsg.lon;
    	    target.latitudeText = formatLat(decMsg.lat);
    	    target.longitudeText = formatLon(decMsg.lon);
    	    calculateRangeAndBearing(target);
    	}
    	
    	if (decMsg.cog !== undefined) {
    	    target.COG2 = ('00' + Math.round(decMsg.cog)).slice(-3);
    	}

    	if (decMsg.sog !== undefined) {
    	    target.SOG = decMsg.sog.toFixed(1);
    	}

    	if (decMsg.cargo !== undefined) {
    	    target.VesselType = decMsg.cargo;
    	    target.VesselTypeString = decMsg.GetVesselType();
    	}
		    
		// FIXME: add NAV_STATUS. decMsg.GetNavStatus()
		// 0: "Under way using engine",
		// 1: "At anchor"
		    
		// FIXME: add MSG_TYPE. decMsg.Getaistype()... probably not too
		// interesting
		// 1: "Position Report Class A",
		// 14: "Safety Related Broadcast Message",
    	
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
		
	    // FIXME: add GPS accuracy and satellite data
		
        if (decMsg.valid) {
            if (decMsg.lat !== undefined) {
        	gpsModel.lat = decMsg.lat;
        	gpsModel.lon = decMsg.lon;
        	gpsModel.latitudeText = formatLat(decMsg.lat);
        	gpsModel.longitudeText = formatLon(decMsg.lon);
        	gpsModel.magvar = Magvar.Get(gpsModel.lat, gpsModel.lon).toFixed(2);
            }
	
            if (decMsg.cog !== undefined) {
    	    	gpsModel.COG = ('00' + Math.round(decMsg.cog)).slice(-3);
            }

            if (decMsg.sog !== undefined) {
        	gpsModel.SOG = decMsg.sog.toFixed(1);
            }

            console.log('gpsModel',gpsModel);
        }
        
    }
}

// function that reconnect the client to the server
function reconnect() {
    setTimeout(() => {
        client.removeAllListeners(); 
        connect();
    }, 1000);
}

connect();

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
    if (gpsModel.lat === undefined) {
	return;
    }
    
    // geolib.getDistanceSimple
    
    var range = geolib.convertUnit(
	    'sm', 
	    geolib.getDistance(
		    {latitude: gpsModel.lat, longitude: gpsModel.lon},
		    {latitude: target.lat, longitude: target.lon}
	    )
    ).toFixed(2);
    
    var bearing = Math.round(geolib.getRhumbLineBearing(
	    {latitude: gpsModel.lat, longitude: gpsModel.lon},
	    {latitude: target.lat, longitude: target.lon}
    ));
    
    target.Range = range;
    target.Bearing = bearing;

}