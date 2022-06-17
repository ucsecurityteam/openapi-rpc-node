'use strict';

module.exports = {
  /*
  Services listed below does not have the logging done in standard format. If we enable standard logging for them,
  the log data will be stringified, which will disable filter search on data fields.
  */
  STANDARD_LOGGING_DISABLED: [
    "chanakya",
    "internal-dashboard",
    "service-market"
  ]
};