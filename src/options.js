import { STORAGE_LICENSE } from './lib/constants.js';
import { buyoutPlaceholder } from './lib/copy.js';
import { describeLicense } from './lib/license.js';

const app = document.querySelector('#app');
const placeholder = buyoutPlaceholder();

chrome.storage.local.get(STORAGE_LICENSE, (data) => {
  render(data[STORAGE_LICENSE] || '');
});

function render(code) {
  app.replaceChildren();
  const title = document.createElement('h1');
  title.textContent = 'AI 聊天导出';
  const intro = document.createElement('p');
  intro.textContent = '许可码只保存在这台浏览器的本地存储里。这里没有付款，也不会打开结账页。';
  const status = document.createElement('p');
  status.id = 'license-status';
  const input = document.createElement('input');
  input.id = 'license-code';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = '输入本地许可码';
  input.value = code || '';
  status.textContent = describeLicense(input.value).message;
  input.addEventListener('input', () => {
    status.textContent = describeLicense(input.value).message;
  });
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'primary';
  save.textContent = '保存许可码';
  save.addEventListener('click', () => {
    const next = input.value.trim();
    chrome.storage.local.set({ [STORAGE_LICENSE]: next }, () => {
      status.textContent = describeLicense(next).message;
    });
  });
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = '清除许可码';
  clear.addEventListener('click', () => {
    chrome.storage.local.remove(STORAGE_LICENSE, () => {
      input.value = '';
      status.textContent = describeLicense('').message;
    });
  });
  const row = document.createElement('div');
  row.className = 'row';
  row.append(save, clear);
  const buyout = document.createElement('p');
  buyout.className = 'note';
  buyout.id = 'buyout-placeholder';
  buyout.textContent = placeholder.label;
  app.append(title, intro, status, input, row, buyout);
}
