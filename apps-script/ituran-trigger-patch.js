/**
 * Install once from the Apps Script editor to poll Ituran report emails every 10 minutes.
 * Uses the existing pollIturan() function in Code.js. This does not deploy the web app.
 */
function installIturanPollingTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (trigger) { return trigger.getHandlerFunction() === 'pollIturan'; })
    .forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });

  ScriptApp.newTrigger('pollIturan').timeBased().everyMinutes(10).create();
  Logger.log('Ituran Gmail polling scheduled every 10 minutes.');
}
