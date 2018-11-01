
const mdns = require('multicast-dns')();
const ip = require("ip");


//setup auto-discovery
mdns.on('query', function(query) {
    if (query.questions[0] 
            && query.questions[0].name === '_vesper-nmea0183._tcp.local'
            //&& query.questions[0].type === 'PTR'
            //&& query.questions[0].class === 'IN'
                ) {
        console.log('got a query packet:', query,'\n');
        console.log(ip.address('public','ipv6'));
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
                        port:39150,
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

    if (query.questions[0] 
    && query.questions[0].name === 'ribbit._vesper-nmea0183._tcp.local'
    //&& query.questions[0].type === 'PTR'
    //&& query.questions[0].class === 'IN'
        ) {
console.log('got a query packet:', query,'\n');
mdns.respond({
    answers: [
        {
            name: 'ribbit._vesper-nmea0183._tcp.local',
            type: 'SRV',
            class: 'IN',
            ttl: 300,
            flush: true,
            data: {
              port:39150,
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

