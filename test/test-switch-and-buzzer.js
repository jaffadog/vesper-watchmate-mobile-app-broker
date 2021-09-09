
var Gpio = require('onoff').Gpio,
  buzzer = new Gpio(17, 'out'),
  button = new Gpio(2, 'in', 'both');
 
button.watch(function(err, value) {
  if (err) exit();
  buzzer.writeSync(value);
});

function startAlarm() {
	console.log('alarm on');
	// toggle led on and off every 500 ms
	alarm = setInterval(function() {
		try {
			var onOff = buzzer.readSync() ^ 1;
			console.log('alarm!',onOff);
			buzzer.writeSync(onOff);
		}
	    catch (err) {
	        console.log('error in startAlarm',err.message);
	    }
	}, 100);
}

startAlarm();

//console.log(buzzer.readSync());
//buzzer.writeSync(1);
//console.log(buzzer.readSync());


function exit() {
  buzzer.unexport();
  button.unexport();
  process.exit();
}
 
process.on('SIGINT', exit);

