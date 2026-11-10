import { BUYOUT_STUB_CODE } from './constants.js';

export function normalizeLicenseCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function isValidBuyoutCode(value) {
  const code = normalizeLicenseCode(value);
  return code.length > 0 && code === BUYOUT_STUB_CODE;
}

export function describeLicense(value) {
  const code = normalizeLicenseCode(value);
  if (!code) return { active: false, message: '未填写许可码，当前为免费档' };
  if (isValidBuyoutCode(code)) return { active: true, message: '本地买断已生效，批量不限次' };
  return { active: false, message: '许可码无效，仍为免费档' };
}
