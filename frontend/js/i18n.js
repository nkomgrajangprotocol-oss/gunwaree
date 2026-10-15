/* GunWaree: every string the scripts put on screen, in English and Thai.
   Static page copy lives in the HTML; anything JS writes comes from here.
   Backend `detail` text is Thai only, so errors are mapped from the status code instead. */

(function (GW) {
  'use strict';

  GW.t = {
    errors: {
      network: {
        en: 'We could not reach the GunWaree server. Check your connection and try again.',
        th: 'เชื่อมต่อเซิร์ฟเวอร์ GunWaree ไม่ได้ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง'
      },
      timeout: {
        en: 'The server took too long to answer. Try again in a moment.',
        th: 'เซิร์ฟเวอร์ตอบช้าเกินไป โปรดลองอีกครั้งในอีกสักครู่'
      },
      400: { en: 'This request could not be completed.', th: 'ไม่สามารถดำเนินการตามคำขอนี้ได้' },
      401: { en: 'Please log in to continue.', th: 'กรุณาเข้าสู่ระบบ' },
      403: { en: 'You do not have permission to do this.', th: 'ไม่มีสิทธิ์' },
      404: { en: 'We could not find what you asked for.', th: 'ไม่พบข้อมูลที่ต้องการ' },
      409: { en: 'This username or email is already registered.', th: 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้แล้ว' },
      422: { en: 'Some details are missing or not valid.', th: 'กรอกข้อมูลไม่ครบหรือไม่ถูกต้อง' },
      503: { en: 'There is no data to assess yet.', th: 'ยังไม่มีข้อมูลให้ประเมิน' },
      server: { en: 'Something went wrong on the server. Please try again.', th: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ โปรดลองอีกครั้ง' },

      loginFailed: { en: 'Username or password is incorrect.', th: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' },
      codeInvalid: { en: 'This code is wrong or has expired. Request a new one.', th: 'รหัสไม่ถูกต้องหรือหมดอายุ โปรดขอรหัสใหม่' }
    },

    fields: {
      required: { en: 'This field is required.', th: 'กรุณากรอกช่องนี้' },
      usernameLength: { en: 'Use 3 to 32 characters.', th: 'ใช้ 3 ถึง 32 ตัวอักษร' },
      emailFormat: { en: 'Enter an email address like name@example.com.', th: 'กรอกอีเมลให้ถูกรูปแบบ เช่น name@example.com' },
      passwordLength: { en: 'Use at least 8 characters.', th: 'ใช้อย่างน้อย 8 ตัวอักษร' },
      passwordMix: { en: 'Include at least one letter and one number.', th: 'มีทั้งตัวอักษรและตัวเลขอย่างน้อยอย่างละ 1 ตัว' },
      passwordTooLong: { en: 'This password is too long. Use a shorter one.', th: 'รหัสผ่านยาวเกินไป โปรดใช้รหัสที่สั้นลง' },
      confirmMatch: { en: 'The passwords do not match.', th: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน' },
      termsRequired: { en: 'Please agree to the Terms of Service and Privacy Policy.', th: 'กรุณายอมรับข้อกำหนดการใช้งานและนโยบายความเป็นส่วนตัว' }
    },

    states: {
      connecting: {
        en: 'Connecting to the server. The first request can take up to a minute.',
        th: 'กำลังเชื่อมต่อเซิร์ฟเวอร์ คำขอแรกอาจใช้เวลาถึง 1 นาที'
      },
      loggingIn: { en: 'Logging in', th: 'กำลังเข้าสู่ระบบ' },
      creating: { en: 'Creating account', th: 'กำลังสร้างบัญชี' },
      sending: { en: 'Sending', th: 'กำลังส่ง' },
      saving: { en: 'Saving', th: 'กำลังบันทึก' },
      accountCreated: {
        en: 'Your account was created. Log in to continue.',
        th: 'สร้างบัญชีแล้ว เข้าสู่ระบบเพื่อใช้งานต่อ'
      },
      codeIssued: {
        en: 'If this email is registered, a reset code has been issued. In this prototype the code is shown to the GunWaree team, not emailed, so ask the team for it.',
        th: 'ถ้าอีเมลนี้อยู่ในระบบ เราได้ออกรหัสให้แล้ว ระบบต้นแบบนี้ยังไม่ส่งอีเมลจริง รหัสจะแสดงให้ทีม GunWaree เห็น โปรดขอรหัสจากทีม'
      }
    },

    roles: {
      client: { en: 'Member', th: 'ผู้ใช้ทั่วไป' },
      admin: { en: 'Admin', th: 'ผู้ดูแลระบบ' }
    },

    // Shared level and status labels for the pages that come next
    levels: {
      none: { en: 'Normal', th: 'ปกติ' },
      watch: { en: 'Watch', th: 'เฝ้าระวัง' },
      warning: { en: 'Warning', th: 'เตือนภัย' },
      critical: { en: 'Critical', th: 'วิกฤต' },
      safe: { en: 'Safe', th: 'ปลอดภัย' },
      medium: { en: 'Medium', th: 'ปานกลาง' },
      high: { en: 'High', th: 'สูง' },
      danger: { en: 'Danger', th: 'อันตราย' },
      nodata: { en: 'No data', th: 'ไม่มีข้อมูล' }
    },
    incidentStatus: {
      new: { en: 'Received', th: 'รับเรื่องแล้ว' },
      in_progress: { en: 'In progress', th: 'กำลังดำเนินการ' },
      resolved: { en: 'Completed', th: 'เสร็จสิ้น' }
    },
    awaiting: { en: 'Awaiting report', th: 'รอการรายงาน' }
  };

  /* Fill an element with an English line and a Thai line (text only, never HTML). */
  GW.renderBi = function (el, msg) {
    el.textContent = '';
    if (!msg) return;
    var en = document.createElement('span');
    en.textContent = msg.en;
    var th = document.createElement('span');
    th.lang = 'th';
    th.textContent = msg.th;
    el.appendChild(en);
    el.appendChild(document.createTextNode(' '));
    el.appendChild(th);
  };
})(window.GW = window.GW || {});
