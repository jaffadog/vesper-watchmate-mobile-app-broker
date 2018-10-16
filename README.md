# Vesper WatchMate Mobile App Broker
Use the Vesper WatchMate mobile app with any AIS transponder

<img src="https://github.com/jaffadog/vesper-watchmate-mobile-app-broker/blob/master/resources/collision_prev_1.png?raw=true" alt="drawing" style="width:100px;"/>

![screenshot](https://github.com/jaffadog/vesper-watchmate-mobile-app-broker/blob/master/resources/collision_prev_1.png?raw=true =200x "screenshot")

The very nice [Vesper WatchMate mobile app](https://www2.vespermarine.com/watchmate-ios) uses a proprietary protocol to interface with the Vesper "smartAIS" range of transponders (XB-8000 and WatchMate Vision). This proprietary protocol is a combination of NMEA over TCP and web services hosted on supported transponders.

This project will create a proxy/broker which can integrate with an unsupported AIS transponder and present the data on interfaces that emulate the "smartAIS" transponders, thus fooling the WatchMate mobile app into thinking it is working with a supported transponder. I own an XB6000, so initial development will be focused on making this work with an XB6000, but I expect any AIS with NMEA over TCP can probably be made to work, and so I'll aim to keep the interface to the AIS transponder generic.

There will be limits in what Vesper WatchMate mobile app functionality will work through this proxy/broker, but I aim to get the following working:

- AIS plotter and CPA alarm
- List of AIS targets
- Anchor watch and alarm

What will definitely not be supported:

- Transponder firmware updates
