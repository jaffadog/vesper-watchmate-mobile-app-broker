# Vesper WatchMate Mobile App Broker
Use the Vesper WatchMate mobile app with any AIS transponder

<img src="https://github.com/jaffadog/vesper-watchmate-mobile-app-broker/blob/master/resources/watchmate_ipad.png?raw=true" alt="drawing" width="400"/>

The very nice [Vesper WatchMate mobile app](https://www2.vespermarine.com/watchmate-ios) uses a proprietary protocol to interface with the Vesper "smartAIS" range of transponders (XB-8000 and WatchMate Vision). This proprietary protocol is a combination of NMEA over TCP and web services hosted on supported transponders.

This project will create a proxy/broker, intended to be deployed on a Raspberry Pi, which can integrate with an unsupported AIS transponder and present the data on interfaces that emulate the "smartAIS" transponders, thus permitting use of WatchMate mobile app with an unsupported transponder. I own an XB6000, so initial development will be focused on making this work with an XB6000, but I expect any AIS with NMEA over TCP can probably be made to work, and so I'll aim to keep the interface to the AIS transponder generic.

Stuff that works at this point:

- Receive NMEA/AIS data from transponder - providing GPS position and AIS target data
- Display AIS targets - plotter and table/list
- Trigger alarms for guard, CPA, and MOB/SART transponder detection
- Select and edit collision profiles (guard and CPA alarm thresholds)
- Anchor watch partially working (see below)
- Automate transition from underway to anchored, and vice versa. Including setting the anchor watch and switching collision profiles.
- Integrate with Raspberry Pi GPIO for audible alarm buzzer and push button to mute alarms

Stuff that I am working on:

- Anchor watch. Starting the anchor watch and alarming works, but we don't see the boat move with respect to the anchor in the app anchor watch page, and we don't see the breadcrumbs of previous positions. Nor are we able adjust the anchor location (presumably by dragging the icon).
- I have this working for the Android app, but it does not work for the iOS app. There are significant differences between the Android and iOS WatchMate apps. In my testing the Android app is significantly more stable and responsive than the iOS app.

Stuff that will definitely never be supported:

- Transponder firmware updates
