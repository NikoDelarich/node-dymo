var usb = require('usb'),
    events = require('events'),
    async = require('async'),
    HID = require('node-hid'),
    Scale;
    
Scale = function() {
  var that = this,
      status = false;

  events.EventEmitter.call(this);

  this.vendorId = 0x922;
  this.weight = {
    value: 0,
    overweight: false,
    system: undefined,
  };

  this.weightIdentCount = 0;

  this.connect = function(usbDesc) {
    async.waterfall([
      function(callback) {
        var hidDesc = null, hidDevice;

        var devices = HID.devices().filter(function(x) {
          if(usbDesc) {
            // Find HID device
            if( x.vendorId == usbDesc.deviceDescriptor.idVendor &&
                x.productId == usbDesc.deviceDescriptor.idProduct )
            {
              return true;
            }

            // Open first device if none was provided
            return false;
          }

          return x.manufacturer === "DYMO";
        });
        if (devices.length > 0) {
          hidDesc = devices[0];
        } else {
          callback('No USB scale detected');
          return;
        }

        hidDevice = new HID.HID(hidDesc.path);
        if (hidDevice) {
          callback(null, hidDevice);
        } else {
          callback('Could not open USB device');
        }
      },

      function(device, callback) {
        status = true;

        device.on('error', function(data) {
          status = false;
          that.emit('end');
          callback(data);
        });

        device.on('end', function(data) {
          status = false;
          that.emit('end');
          callback(data);
        });

        device.on('data', function(data) {
          var dataArray = data.toJSON().data,
              change = false,
              value = 0,
              overweight = false,
              underZero = false,
              valueOk = false,
              system = 'ounces';

          if (dataArray[1] === 2) {
            // no weight is on the scale
            valueOk = true;
            value = 0;
            if(that.weightIdentCount < 3) that.weightIdentCount = 3;
          }
          if (dataArray[1] === 4) {
            valueOk = true;
          }
          if (dataArray[1] === 5) {
            valueOk = true;
            underZero = true;
          }
          if (dataArray[2] == 11) {
            system = 'ounces';
          }
          if (dataArray[2] == 2) {
            system = 'grams';
          }
          if (valueOk && system === 'ounces') {
            value = Math.round(((dataArray[4] + (dataArray[5] * 256)) * 0.1) * 10) / 10;
          }
          if (valueOk && system === 'grams') {
            value = Math.round((dataArray[4] + dataArray[5] * 256) * 10) / 10;
          }
          if (dataArray[1] === 6) {
            // there's too much weight
            value = 0;
            overweight = true;
          }

          // Negative value
          if(underZero) value = -value;

          if (that.weight.overweight !== overweight) {
            that.weight.overweight = overweight;
            that.emit('overweight-change', overweight);
            change = true;
          }
          if (valueOk && that.weight.value !== value) {
            that.weight.value = value;
            that.weight.system = system;
            that.emit('weight-change', { value: value, system: system });
            change = true;
          }
          if (change === true) {
            that.weightIdentCount = 0;
            that.emit('weight', that.weight);
          } else if(!that.weight.overweight) {
            if(that.weightIdentCount < 3) {
              that.weightIdentCount++;
            } else if(that.weightIdentCount == 3) {
              that.weightIdentCount++;
              that.emit('weight-stable', that.weight);
            }
          }
        });
      }
    ], function(err, result) {
      if (err) {
        // TODO: do something to handle errors
      }
    });
  };

  this.getWeight = function() {
    return {
      value: this.weight.value,
      system: this.weight.system
    }
  };

  this.getOverweightStatus = function() {
    return this.weight.overweight;
  };

  this.getStatus = function() {
    return status;
  };

  usb.on('attach', function(device) {
    // A new USB device was attached/powered on, check to see if it's a scale
    if (device.deviceDescriptor.idVendor === that.vendorId) {
      that.connect(device);
      that.emit('online');
    }
  })

  usb.on('detach', function(device) {
    // A device was detached.  See if it's our scale
    if (device.deviceDescriptor.idVendor === that.vendorId) {
      status = false;
      that.emit('offline');
    }
  })

};

Scale.prototype.__proto__ = events.EventEmitter.prototype;
module.exports = new Scale();
