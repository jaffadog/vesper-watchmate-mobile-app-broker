# Vesper WatchMate Mobile App Broker
Use the Vesper WatchMate mobile app with any AIS transponder

<img src="https://github.com/jaffadog/vesper-watchmate-mobile-app-broker/blob/master/resources/watchmate_ipad.png?raw=true" alt="drawing" width="400"/>

The very nice [Vesper WatchMate mobile app](https://www2.vespermarine.com/watchmate-ios) uses a proprietary protocol to interface with the Vesper "smartAIS" range of transponders (XB-8000 and WatchMate Vision). This proprietary protocol is a combination of NMEA over TCP and web services hosted on supported transponders.

This project will create a proxy/broker which can integrate with an unsupported AIS transponder and present the data on interfaces that emulate the "smartAIS" transponders, thus permitting use of WatchMate mobile app with an unsupported transponder. I own an XB6000, so initial development will be focused on making this work with an XB6000, but I expect any AIS with NMEA over TCP can probably be made to work, and so I'll aim to keep the interface to the AIS transponder generic.

There will be limits in what Vesper WatchMate mobile app functionality will work through this proxy/broker, but I aim to get the following working:

- AIS plotter and CPA alarm
- List of AIS targets
- Anchor watch and alarm

What will definitely not be supported:

- Transponder firmware updates

A few features that are in the works:

- Integrate with Raspberry Pi GPIO terminals to sound a beeper and/or blink and LED when an alarm is raised.
- Integrate with Raspberry Pi GPIO terminals to permit the alarm to be silenced/muted.
- Automatically enable anchor watch and switch to "anchor" collision profile when the vessel has stopped moving for X minutes.
- Automatically disable anchor watch and switch to "coastal" collision profile when vessel is moving than X knots and is more than Y miles from the anchor location.

The above features enable fully automated use of both collison and anchor watch alarms without any user interaction and without the need to use any mobile app. And all of this will run 24x7 with super-low power consumption (~ less than 4 watts or 8 Ah) 
