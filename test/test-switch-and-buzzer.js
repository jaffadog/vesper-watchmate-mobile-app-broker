
var Gpio = require('onoff').Gpio,
  buzzer = new Gpio(17, 'out'),
  button = new Gpio(2, 'in', 'both');
 
button.watch(function(err, value) {
  if (err) exit();
  buzzer.writeSync(value);
});
 
function exit() {
  buzzer.unexport();
  button.unexport();
  process.exit();
}
 
process.on('SIGINT', exit);

