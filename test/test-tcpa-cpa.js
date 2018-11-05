"use strict";

const geolib = require('geolib');

const initialLat = 45;
const initialLon = -70;

var gps = {
	lat: initialLat,
	lon: initialLon,
	cog: 120,
	sog: 6.1,
}

var targets = {};

targets['111111111'] = {
		mmsi: '111111111',
		lat: initialLat + 10/60,
		lon: initialLon + 6/60,
		cog: 200,
		sog: 15,
}

targets['222222222'] = {
		mmsi: '222222222',
		lat: initialLat - 6/60,
		lon: initialLon - 10/60,
		cog: 90,
		sog: 10,
}

targets['333333333'] = {
		mmsi: '333333333',
		lat: initialLat + 10/60,
		lon: initialLon - 10/60,
		cog: 135,
		sog: 25,
}

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

function formatTcpa(tcpa) {
    // returns hh:mm:ss, e.g. 01:15:23
    // 012345678901234567890
    // 1970-01-01T00:00:07.000Z
    if (tcpa === undefined) {
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
     var velocity2 = generateSpeedVector(target.lat,target.sog,target.cog);
     
     // console.log(position1,velocity1,position2,velocity2);
    
     // returns tcpa in seconds from now
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
    
     var cpa = geolib.getDistance({
         latitude : cpaPosition1[0],
         longitude : cpaPosition1[1]
     }, {
         latitude : cpaPosition2[0],
         longitude : cpaPosition2[1]
     }) / 1852;
    
     // console.log('cpa (NM)',cpa);
    
     target.cpa = cpa;
     target.tcpa = tcpa;
}

// returns speed in degrees per second
function generateSpeedVector (latitude, speed, course) {
    var northSpeed = speed * Math.cos(course * Math.PI / 180) / 60 / 3600;
    var eastSpeed = speed * Math.sin(course * Math.PI / 180) / 60 / 3600 * Math.abs(Math.cos(latitude * Math.PI / 180));
    return [northSpeed, eastSpeed, 0]
}    

// returns speed in meters per second
// 1852 meters per NM
// 1 kn = 1852 / 3600 m/s
function generateSpeedVector2 (speed, course) {
    var northSpeed = speed * Math.cos(course * Math.PI / 180) * 1852 / 3600;
    var eastSpeed = speed * Math.sin(course * Math.PI / 180) * 1852 / 3600;
    return [northSpeed, eastSpeed, 0]
} 

function test3(target) {
	
// var gps2 = {
// lat: 0,
// lon: 0,
// cog: gps.cog,
// sog: gps.sog,
// };
//	
// var target2 = {
// lat: target.lat - gps.lat,
// lon: target.lon - gps.lon,
// cog: target.cog,
// sog: target.sog,
// }
	
	addCoordsInMeters(target,gps);
	//addCoordsInMeters(gps);
	
	addSpeed(target);
	addSpeed(gps);
	
	// console.log(gps);
	// console.log(target);
	
	// http://www.dtic.mil/dtic/tr/fulltext/u2/d019980.pdf
	
	// t = (-xvx + avx + xva - ava - yvy + bvy + yvb - bvb) / (vx2 - 2vxva + va2
	// + vy2 - 2vyvb + vb2)
	var tttt = (-gps.x*gps.vx + target.x*gps.vx + gps.x*target.vx - target.x*target.vx - gps.y * gps.vy + target.y * gps.vy + gps.y*target.vy - target.y*target.vy) / 
	(Math.pow(gps.vx,2) - 2*gps.vx*target.vx + Math.pow(target.vx,2) + Math.pow(gps.vy,2) - 2*gps.vy*target.vy + Math.pow(target.vy,2));
	
	console.log('test 3 tttt',tttt,tttt/60,tttt/3600);
	
	var x = 0 // gps.x;
	var y = 0 // gps.y;
	var vx = gps.vx;
	var vy = gps.vy;
	
	var a = target.x;
	var b = target.y;
	var va = target.vx;
	var vb = target.vy;
	
	var ttt = (-x*vx + a*vx + x*va - a*va - y*vy + b*vy + y*vb - b*vb) / (Math.pow(vx,2) - 2*vx*va + Math.pow(va,2) + Math.pow(vy,2) - 2*vy*vb + Math.pow(vb,2))

	console.log('test 3 ttt',ttt,ttt/60,ttt/3600);

	
	// ([x + tvx − (a + tva)]2 + [y + tvy − (b + tvb)]2 )½
	// var s = ( (gps.x + t*gps.vx − (target.x + t*target.vx))^2 + (gps.y +
	// t*gps.vy − (target.y + t*target.vy))^2 )^0.5;
	
	// console.log('tt',tt,tt/3600);
	// console.log(s);

	// console.log('ttt',ttt,ttt/3600);
	
//	console.log('x,y',x,y);
//	console.log('vx,vy',vx,vy);
//	
//	console.log('a,b',a,b);
//	console.log('va,vb',va,vb);
//
//	console.log('dx,dy',x-a,y-b);
//	console.log('vdx,vdy',vx-va,vy-vb);
//	
//	console.log();
	
// console.log(0.1666*111120);
// console.log(0.1666*111120*.707)
//
// console.log(-70.16666666666667 * 111120.0 * 0.7050469022146705,'?=',
// -5507088.451010021)
// console.log(-70 * 111120 * 0.7071067811865476,'?=', -5510058.8817180535)
// console.log(-70.0 * 111120.0 * 0.7071067811865476,'?=', -5510058.8817180535)
//	
// console.log((-70.16666666666667 * 111120.0 * 0.7050469022146705) - (-70.0 *
// 111120.0 * 0.7071067811865476))
//
// console.log((-70.16666666666667+70.0) * 111120.0 * 0.7050469022146705)

	
}


// http://geomalgorithms.com/a07-_distance.html

// http://www.movable-type.co.uk/scripts/latlong.html

// #define dot(u,v)   ((u).x * (v).x + (u).y * (v).y + (u).z * (v).z)
function dot(u,v) {
	return u.x * v.x + u.y * v.y;
}

// #define norm(v)    sqrt(dot(v,v))  // norm = length of  vector
function norm(v) {
	return Math.sqrt(dot(v,v));
}

//#define d(u,v)     norm(u-v)        // distance = norm of difference
function dist(u,v) {
	return norm({
		x: u.x - v.x,
		y: u.y - v.y,
	});
}

function tcpa4(target) {
	
	addCoordsInMeters(target,gps);
	// addCoordsInMeters(gps2);
	
	addSpeed(target);
	addSpeed(gps);

	// dv = Tr1.v - Tr2.v (this is delta v)
	
	var dv = {
			x: gps.vx - target.vx,
			y: gps.vy - target.vy,
	}
	
	var dv2 = dot(dv,dv);
	
	// w0 = Tr1.P0 - Tr2.P0
	// we shifted location frame of reference to me=0,0
	var w0 = {
			x: 0 - target.x,
			y: 0 - target.y,
	}
	
	var cpatime = -dot(w0,dv) / dv2;
	
	console.log('cpatime',cpatime,cpatime/60,cpatime/3600);
	
	// float ctime = cpa_time( Tr1, Tr2);
	// Point P1 = Tr1.P0 + (ctime * Tr1.v);
	var p1 = {
			x: 0 + cpatime*gps.vx,
			y: 0 + cpatime*gps.vy,
	}
	
	// Point P2 = Tr2.P0 + (ctime * Tr2.v);
	var p2 = {
			x: target.x + cpatime*target.vx,
			y: target.y + cpatime*target.vy,
	}

	// return d(P1,P2); // distance at CPA
	// #define d(u,v) norm(u-v) // distance = norm of difference
	// #define norm(v)    sqrt(dot(v,v))  // norm = length of  vector
	var d = dist(p1,p2);
	
	console.log('d',d,'meters',d/1852,'nm');
	
}

// add x,y in m
function addCoordsInMeters(t,g) {
	t.y = (t.lat - g.lat) * 111120;
	// console.log('t.y',t.lat,'*',111120,'=',t.y);
	t.x = (t.lon - g.lon) * 111120 * Math.cos(g.lat * Math.PI / 180);
	// console.log('t.x',t.lon,'*',111120,'*',Math.cos(t.lat * Math.PI /
	// 180),'=',t.x);
}

// add vx,vy in m/s
function addSpeed(t) {
    t.vy = t.sog * Math.cos(t.cog * Math.PI / 180) * 1852 / 3600;
    t.vx = t.sog * Math.sin(t.cog * Math.PI / 180) * 1852 / 3600;
}

var target = targets['333333333'];

updateCpa(target);
console.log('tcpa=',target.tcpa,formatTcpa(target.tcpa));
console.log('cpa=',target.cpa,'\n');

test3(target);

tcpa4(targets['111111111']); // 40.26 mins	3.77 nm vs 3.36 actual	
tcpa4(targets['222222222']); // 98.22 mins	1.20 nm vs 0.58 actual
tcpa4(targets['333333333']); // 38.18 mins	1.07 nm vs 0.22 actual

// console.log('dx',gps.x - target.x)
// console.log('dy',gps.y - target.y)
//
//
// console.log('to m',-70 * 111120 * Math.cos(0 * Math.PI / 180));
// console.log('to m',-70 * 111120 * Math.cos(35 * Math.PI / 180));
// console.log('to m',-70.17 * 111120 * Math.cos(35 * Math.PI / 180));
//
//
// gps = {
// lat:0,
// lon:-70
// }
//
// target = {
// lat:0,
// lon:-(70+10/60)
// }
//
// addCoordsInMeters(target);
// addCoordsInMeters(gps);
//
// console.log(1, gps.x,target.x,gps.x-target.x)
//
// gps = {
// lat:35,
// lon:-70
// }
//
// target = {
// lat:35,
// lon:-(70+10/60)
// }
//
// addCoordsInMeters(target);
// addCoordsInMeters(gps);
//
// console.log(2, gps.x,target.x,gps.x-target.x)


// correct answers:
// 111 3.36nm
// 222 0.58nm
// 333 0.22nm in about 39 mins



