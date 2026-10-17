import {createController} from './download.js';
import {userFacingError} from './core.js';

const controller = createController(chrome);
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('popup.html'))) return;
  if (!['inspect', 'download'].includes(request?.type)) return;
  const task = request.type === 'inspect' ? controller.inspect(request.tabId) : controller.startDownload(request);
  task.then(sendResponse).catch(error => sendResponse({ok: false, message: userFacingError(error)}));
  return true;
});
