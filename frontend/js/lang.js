/* GunWaree language switch: Thai or English, one at a time.
   Default follows the visitor's system language (Thai system -> Thai, anything else -> English);
   a choice made with the [TH|EN] switch is remembered on this device.

   Markup hooks
     data-i18n="key"             text content
     data-i18n-aria="key"        aria-label
     data-i18n-tip="key"         tooltip text (title for the collapsed sidebar)
     data-i18n-ph="key"          placeholder
     data-lang-btn="th" / "en"   the switch buttons
   Scripts listen for the "gw:lang" event to re-render dynamic text. */

(function (GW) {
  'use strict';

  var KEY = 'gw_lang';

  GW.STR = {
    // Shared
    'lang.label': { en: 'Language', th: 'ภาษา' },
    'brand.tagline': { en: 'Stay informed. Stay prepared. Stay safe.', th: 'รู้ทัน เตรียมพร้อม ปลอดภัย' },
    'legal.terms': { en: 'Terms of Service', th: 'ข้อกำหนดการใช้งาน' },
    'legal.privacy': { en: 'Privacy Policy', th: 'นโยบายความเป็นส่วนตัว' },
    'legal.notice': {
      en: 'Hackathon prototype, not an official flood warning. In an emergency call 191 or 1669.',
      th: 'ต้นแบบสำหรับงานแฮกกาธอน ไม่ใช่ประกาศเตือนภัยทางการ เหตุฉุกเฉินโทร 191 หรือ 1669'
    },
    'legal.credits': {
      en: 'Data: Bangkok Drainage and Sewerage Office via POPNIX Flood, ThaiWater / HII, Open-Meteo (CC BY 4.0), Royal Irrigation Department.',
      th: 'ข้อมูล: สำนักการระบายน้ำ กทม. ผ่าน POPNIX Flood, ThaiWater / สสน., Open-Meteo (CC BY 4.0), กรมชลประทาน'
    },
    'legal.media': { en: 'Sky video: Miguel Á. Padriñán. Bangkok photo: Pexels.', th: 'วิดีโอท้องฟ้า: Miguel Á. Padriñán ภาพกรุงเทพฯ: Pexels' },

    // Intro
    'intro.enter': { en: 'Enter', th: 'เข้าสู่เว็บไซต์' },

    // App shell
    'nav.label': { en: 'Main menu', th: 'เมนูหลัก' },
    'nav.home': { en: 'Home', th: 'หน้าแรก' },
    'nav.risk': { en: 'Rule-based risk level', th: 'ระดับความเสี่ยงตามกฎ' },
    'nav.reports': { en: 'Rescue reports', th: 'แจ้งเหตุและติดตาม' },
    'nav.dams': { en: 'Dam levels', th: 'ระดับน้ำในเขื่อน' },
    'nav.soon': { en: 'Soon', th: 'เร็วๆ นี้' },
    'nav.menu': { en: 'Menu', th: 'เมนู' },
    'nav.levels': { en: 'Levels', th: 'ระดับน้ำ' },
    'nav.water': { en: 'Water levels', th: 'ระดับน้ำคลองและแม่น้ำ' },
    'nav.damsSub': { en: 'The 4 main dams and the Chao Phraya dam', th: '4 เขื่อนหลักและเขื่อนเจ้าพระยา' },
    'nav.waterSub': { en: 'Rivers, canals and road flooding in Bangkok', th: 'แม่น้ำ คลอง และน้ำท่วมถนนในกรุงเทพฯ' },
    'nav.sos': { en: 'Emergency 1669', th: 'ฉุกเฉิน 1669' },
    'sb.collapse': { en: 'Collapse sidebar', th: 'ย่อแถบเมนู' },
    'sb.expand': { en: 'Expand sidebar', th: 'ขยายแถบเมนู' },
    'account.label': { en: 'Account', th: 'บัญชี' },
    'account.guest': { en: 'Not logged in', th: 'ยังไม่ได้เข้าสู่ระบบ' },
    'account.client': { en: 'Member', th: 'ผู้ใช้ทั่วไป' },
    'account.admin': { en: 'Admin', th: 'ผู้ดูแลระบบ' },
    'top.location': { en: 'Bangkok, Thailand', th: 'กรุงเทพฯ ประเทศไทย' },
    'bell.label': { en: 'Alerts', th: 'การแจ้งเตือน' },
    'bell.title': { en: 'Flood alerts', th: 'การแจ้งเตือนน้ำท่วม' },
    'bell.none': { en: 'No alerts right now.', th: 'ยังไม่มีการแจ้งเตือน' },
    'bell.error': { en: 'Alerts could not be loaded.', th: 'โหลดการแจ้งเตือนไม่ได้' },
    'profile.guest': { en: 'Guest', th: 'ผู้เยี่ยมชม' },
    'profile.hello': { en: 'Hello', th: 'สวัสดี' },
    'profile.login': { en: 'Log in', th: 'เข้าสู่ระบบ' },
    'profile.logout': { en: 'Log out', th: 'ออกจากระบบ' },

    // Data status
    'status.connecting': { en: 'Connecting to the server', th: 'กำลังเชื่อมต่อเซิร์ฟเวอร์' },
    'status.live': { en: 'Live data', th: 'ข้อมูลจริง' },
    'status.sim': { en: 'Simulated data', th: 'ข้อมูลจำลอง' },
    'status.sample': { en: 'Sample data, server unavailable', th: 'ข้อมูลตัวอย่าง เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' },
    'status.updated': { en: 'Updated {time}', th: 'อัปเดต {time}' },
    'status.awaiting': { en: 'Awaiting report', th: 'รอการรายงาน' },
    'status.sampleHint': { en: 'Cannot connect to the server. Retrying.', th: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กำลังลองใหม่' },
    'stale.label': { en: 'Last reading at {time} (not updating)', th: 'ข้อมูลล่าสุดเมื่อ {time} (ไม่อัปเดต)' },
    'stale.latest': { en: 'Latest {time}', th: 'ล่าสุด {time}' },
    'stale.noTrend': { en: 'No trend yet: the data is not updating', th: 'ยังไม่มีแนวโน้ม ข้อมูลไม่อัปเดต' },
    'sample.badge': { en: 'Sample data', th: 'ข้อมูลตัวอย่าง' },
    'sample.level': { en: 'Sample: {level}', th: 'ตัวอย่าง: {level}' },
    'sample.notCurrent': { en: 'This is sample data, not the current level. The server cannot be reached.', th: 'นี่คือข้อมูลตัวอย่าง ไม่ใช่ระดับปัจจุบัน เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' },

    // One-time guide to the app for users (js/guide.js)
    'guide.step': { en: 'Step {n} of {total}', th: 'ขั้นที่ {n} จาก {total}' },
    'guide.back': { en: 'Back', th: 'ย้อนกลับ' },
    'guide.next': { en: 'Next', th: 'ถัดไป' },
    'guide.finish': { en: 'Finish', th: 'เสร็จสิ้น' },
    'guide.close': { en: 'Close the tutorial', th: 'ปิดคู่มือการใช้งาน' },
    'guide.askTitle': { en: 'Close the tutorial?', th: 'ปิดคู่มือการใช้งานหรือไม่' },
    'guide.askBody': { en: 'It will not be shown again.', th: 'คู่มือนี้จะไม่แสดงอีก' },
    'guide.yes': { en: 'Yes, close it', th: 'ใช่ ปิดเลย' },
    'guide.no': { en: 'No, keep going', th: 'ไม่ ดูต่อ' },
    'guide.welcome.title': { en: 'Welcome to GunWaree', th: 'ยินดีต้อนรับสู่ GunWaree' },
    'guide.welcome.body': {
      en: 'This short guide shows what each part of the app does. Use Next to move on, or Back to go back.',
      th: 'คู่มือสั้นๆ นี้จะพาดูว่าแต่ละส่วนของแอปทำอะไรได้ กด "ถัดไป" เพื่อไปต่อ หรือ "ย้อนกลับ" เพื่อดูขั้นก่อนหน้า'
    },
    'guide.menu.title': { en: 'The menu', th: 'เมนู' },
    'guide.menu.body': {
      en: 'Move between pages here: Home, Rule-based risk level, Rescue reports and Levels.',
      th: 'ใช้เมนูนี้ไปยังหน้าต่างๆ ได้แก่ หน้าแรก ระดับความเสี่ยงตามกฎ แจ้งเหตุและติดตาม และระดับน้ำ'
    },
    'guide.risk.title': { en: 'Rule-based risk level', th: 'ระดับความเสี่ยงตามกฎ' },
    'guide.risk.body': {
      en: 'A level for the river at Ayutthaya (station 39) over the next 24 hours, from a simple rule. It is not an AI model and not an official warning. Its own page shows how the level is decided.',
      th: 'ระดับของแม่น้ำที่อยุธยา (สถานี 39) ใน 24 ชั่วโมงข้างหน้า คำนวณจากกฎง่ายๆ ไม่ใช่โมเดล AI และไม่ใช่ประกาศเตือนภัยทางการ หน้าของระดับความเสี่ยงอธิบายว่าระดับนี้ตัดสินอย่างไร'
    },
    'guide.near.title': { en: 'Conditions near you', th: 'สถานการณ์ใกล้คุณ' },
    'guide.near.body': {
      en: 'See the road flooding gauges near you. Your location is used only in this browser, and you can choose a district instead.',
      th: 'ดูจุดวัดน้ำท่วมถนนที่อยู่ใกล้คุณ ตำแหน่งของคุณใช้เฉพาะในเบราว์เซอร์นี้ และเลือกเขตแทนได้'
    },
    'guide.levels.title': { en: 'Water and dam levels', th: 'ระดับน้ำและเขื่อน' },
    'guide.levels.body': {
      en: 'Levels opens Water levels (rivers, canals and road flooding on a map) and Dam levels (storage in the main dams above Bangkok).',
      th: 'เมนูระดับน้ำมีหน้าระดับน้ำ (แม่น้ำ คลอง และน้ำท่วมถนนบนแผนที่) และหน้าระดับเขื่อน (ปริมาณน้ำในเขื่อนหลักเหนือกรุงเทพฯ)'
    },
    'guide.reports.title': { en: 'Rescue reports', th: 'แจ้งเหตุและติดตาม' },
    'guide.reports.body': {
      en: 'Log in to send a rescue report and follow its status. Reports reach only this project’s admins, not rescue services. In an emergency call 191 or 1669.',
      th: 'เข้าสู่ระบบเพื่อส่งการแจ้งเหตุและติดตามสถานะ การแจ้งเหตุถึงเฉพาะผู้ดูแลระบบของโครงการ ไม่ถูกส่งถึงหน่วยกู้ภัย หากเป็นเหตุฉุกเฉินโทร 191 หรือ 1669'
    },
    'guide.bell.title': { en: 'Alerts', th: 'การแจ้งเตือน' },
    'guide.bell.body': {
      en: 'The bell shows the alerts the GunWaree team has sent. You do not need an account to see them.',
      th: 'กระดิ่งแสดงการแจ้งเตือนที่ทีม GunWaree ส่งแล้ว ดูได้โดยไม่ต้องมีบัญชี'
    },
    'guide.live.title': { en: 'Live refreshes', th: 'อัปเดตอัตโนมัติ' },
    'guide.live.body': {
      en: 'When this is on, the information refreshes by itself. If you turn it off, nothing updates until you turn it back on.',
      th: 'เมื่อเปิดอยู่ ข้อมูลจะอัปเดตเอง ถ้าปิด ข้อมูลจะไม่อัปเดตจนกว่าคุณจะเปิดกลับ'
    },
    'guide.lang.title': { en: 'Thai or English', th: 'ภาษาไทยหรืออังกฤษ' },
    'guide.lang.body': { en: 'Switch the language at any time.', th: 'เปลี่ยนภาษาได้ทุกเมื่อ' },
    'guide.account.title': { en: 'Your account', th: 'บัญชีของคุณ' },
    'guide.account.body': {
      en: 'Log in or sign up here. You need an account to send rescue reports.',
      th: 'เข้าสู่ระบบหรือสมัครสมาชิกที่นี่ ต้องมีบัญชีจึงจะส่งการแจ้งเหตุได้'
    },
    'guide.sos.title': { en: 'Emergency 1669', th: 'ฉุกเฉิน 1669' },
    'guide.sos.body': {
      en: 'Calls the emergency medical number 1669 from your phone.',
      th: 'โทรหาหมายเลขการแพทย์ฉุกเฉิน 1669 จากโทรศัพท์ของคุณ'
    },
    'guide.done.title': { en: 'You are all set', th: 'พร้อมใช้งานแล้ว' },
    'guide.done.body': {
      en: 'To read about this demo again, use “About this demo” at the bottom of every page.',
      th: 'อ่านเรื่องเว็บเดโมนี้อีกครั้งได้จาก “เกี่ยวกับเว็บเดโมนี้” ด้านล่างของทุกหน้า'
    },

    // "Live refreshes" button in the top bar (js/shell.js) and the switch behind it (GW.live in js/api.js)
    'live.label': { en: 'Live refreshes', th: 'อัปเดตอัตโนมัติ' },
    'live.on': { en: 'On', th: 'เปิด' },
    'live.off': { en: 'Off', th: 'ปิด' },
    'live.tipOn': { en: 'The information refreshes by itself. Click to turn this off.', th: 'ข้อมูลอัปเดตเองอัตโนมัติ คลิกเพื่อปิด' },
    'live.tipOff': { en: 'Live refreshes are off, so the information is not updating. Click to turn them back on.', th: 'ปิดการอัปเดตอัตโนมัติอยู่ ข้อมูลจึงไม่อัปเดต คลิกเพื่อเปิดกลับ' },
    'live.warnTitle': { en: 'Turn off live refreshes?', th: 'ปิดการอัปเดตอัตโนมัติหรือไม่' },
    'live.warnBody': {
      en: 'If you turn off live refreshes, the information on screen might not be up to date. It will not refresh or update again until you turn live refreshes back on.',
      th: 'ถ้าปิดการอัปเดตอัตโนมัติ ข้อมูลบนหน้าจออาจไม่เป็นปัจจุบัน และจะไม่รีเฟรชหรืออัปเดตอีกเลยจนกว่าคุณจะเปิดการอัปเดตอัตโนมัติกลับ'
    },
    'live.keep': { en: 'Keep them on', th: 'เปิดไว้ต่อ' },
    'live.turnOff': { en: 'Turn off', th: 'ปิดการอัปเดต' },
    'live.paused': { en: 'Paused (live refreshes are off)', th: 'หยุดอยู่ (ปิดการอัปเดตอัตโนมัติ)' },

    // "This is a demo website" box (js/demo.js), wording from the Captain
    'demo.title': { en: 'This is a demo website', th: 'นี่คือเว็บเดโม' },
    'demo.lead': { en: 'GunWaree is a prototype built for a hackathon. It is not an official warning.', th: 'GunWaree เป็นระบบต้นแบบที่สร้างสำหรับงานแฮกกาธอน ไม่ใช่ประกาศเตือนภัยทางการ' },
    'demo.p1': {
      en: 'Water, rain and road data come from public sources (POPNIX Flood, ThaiWater/HII, Open-Meteo, Royal Irrigation Department), and readings show their time. River levels older than 3 hours are marked “not updating”, gauges on the Water levels page that have not reported for over 3 hours show “No recent report”, and the risk level is not computed from old data.',
      th: 'ข้อมูลน้ำ ฝน และถนนมาจากแหล่งสาธารณะ (POPNIX Flood, ThaiWater/สสน., Open-Meteo, กรมชลประทาน) และค่าที่แสดงมีเวลากำกับ ระดับน้ำแม่น้ำที่เก่ากว่า 3 ชั่วโมงจะขึ้นป้าย “ไม่อัปเดต” สถานีในหน้าระดับน้ำที่ไม่ได้รายงานเกิน 3 ชั่วโมงจะแสดงว่า “ไม่มีรายงานล่าสุด” และระบบจะไม่ประเมินความเสี่ยงจากข้อมูลเก่า'
    },
    'demo.p2': {
      en: 'The risk level comes from a simple rule at the Phra Nakhon Si Ayutthaya station. It is not an AI model and not a probability.',
      th: 'ระดับความเสี่ยงคำนวณจากกฎง่ายๆ ที่สถานีพระนครศรีอยุธยา ไม่ใช่โมเดล AI และไม่ใช่ความน่าจะเป็น'
    },
    'demo.p3': {
      en: 'The ESP32 test rig is an experimental device measuring water in a container, not a real gauge.',
      th: 'ชุดทดลอง ESP32 เป็นอุปกรณ์ทดลองที่วัดน้ำในภาชนะ ไม่ใช่สถานีวัดจริง'
    },
    'demo.p4': {
      en: 'Reports sent here reach only this project’s admins, not rescue services. In a real emergency call 191 (general emergency) or 1784 (Department of Disaster Prevention and Mitigation). For a medical emergency call 1669.',
      th: 'การแจ้งเหตุในเว็บนี้ถึงเฉพาะผู้ดูแลระบบของโครงการ ไม่ถูกส่งถึงหน่วยกู้ภัย หากเป็นเหตุฉุกเฉินจริง โทร 191 (เหตุฉุกเฉินทั่วไป) หรือ 1784 (กรมป้องกันและบรรเทาสาธารณภัย) ส่วนเหตุเจ็บป่วยฉุกเฉินโทร 1669'
    },
    // {privacy} and {terms} become links to privacy.html and terms.html
    'demo.p5': {
      en: 'What you send (accounts, reports) is test data. Admins can see it and it may be deleted when the event ends. See the “{privacy}” and “{terms}”.',
      th: 'สิ่งที่คุณส่ง (บัญชี การแจ้งเหตุ) เป็นข้อมูลทดสอบ ผู้ดูแลระบบเห็นได้ และอาจถูกลบเมื่อจบงาน ดู “{privacy}” และ “{terms}”'
    },
    'demo.privacy': { en: 'Privacy Policy', th: 'นโยบายความเป็นส่วนตัว' },
    'demo.terms': { en: 'Terms', th: 'ข้อกำหนด' },
    'demo.ok': { en: 'Got it', th: 'รับทราบ' },
    'demo.link': { en: 'About this demo', th: 'เกี่ยวกับเว็บเดโมนี้' },

    // Home
    'home.title': { en: 'Flood overview', th: 'ภาพรวมน้ำท่วม' },
    'hero.region': { en: 'Central Thailand', th: 'ภาคกลาง' },
    'hero.city': { en: 'Bangkok', th: 'กรุงเทพมหานคร' },
    'hero.basin': { en: 'Bangkok and the Chao Phraya River basin', th: 'กรุงเทพฯ และลุ่มน้ำเจ้าพระยา' },
    'hero.note': { en: 'A clearer view of the water around you.', th: 'ติดตามสถานการณ์น้ำรอบตัวคุณ' },

    'risk.label': { en: 'Rule-based risk level', th: 'ระดับความเสี่ยงตามกฎ' },
    'risk.how': { en: 'Worked out from the river level at Ayutthaya and its 6-hour trend. Not an AI model.', th: 'คำนวณจากระดับน้ำที่อยุธยาและแนวโน้ม 6 ชั่วโมง ไม่ใช่โมเดล AI' },
    'risk.target': { en: 'Ayutthaya (station 39), next 24 hours', th: 'พระนครศรีอยุธยา (สถานี 39) ภายใน 24 ชั่วโมง' },
    'risk.reading': { en: 'Water {wl} m, bank {bank} m', th: 'ระดับน้ำ {wl} ม. ตลิ่ง {bank} ม.' },
    'risk.nodata': { en: 'No data to assess yet', th: 'ยังไม่มีข้อมูลให้ประเมิน' },
    'risk.official': { en: 'Not an official warning', th: 'ไม่ใช่ประกาศเตือนภัยทางการ' },
    'risk.desc.none': { en: 'The river at Ayutthaya is below the watch level.', th: 'ระดับน้ำที่อยุธยาต่ำกว่าระดับเฝ้าระวัง' },
    'risk.desc.watch': { en: 'The river is close to its bank. Keep an eye on updates.', th: 'ระดับน้ำใกล้ตลิ่ง ติดตามข่าวสารอย่างใกล้ชิด' },
    'risk.desc.warning': { en: 'The river is close to its bank and rising. Prepare to move belongings higher.', th: 'ระดับน้ำใกล้ตลิ่งและกำลังสูงขึ้น เตรียมยกของขึ้นที่สูง' },
    'risk.desc.critical': { en: 'The river has reached its bank. Follow official evacuation guidance.', th: 'ระดับน้ำถึงตลิ่งแล้ว ปฏิบัติตามคำแนะนำการอพยพของหน่วยงาน' },

    'banner.advisory': { en: 'Risk level {level} for the river at Ayutthaya', th: 'ระดับความเสี่ยง{level} สำหรับแม่น้ำที่อยุธยา' },
    'banner.alert': { en: 'Alert from the GunWaree team', th: 'การแจ้งเตือนจากทีม GunWaree' },
    'banner.guidance': { en: 'Avoid flooded roads and follow local evacuation guidance.', th: 'หลีกเลี่ยงถนนที่น้ำท่วมและปฏิบัติตามคำแนะนำของหน่วยงานท้องถิ่น' },

    'districts.title': { en: 'Road flooding across Bangkok', th: 'น้ำท่วมถนนทั่วกรุงเทพฯ' },
    'districts.sub': { en: 'Deepest road reading in each of the 50 districts', th: 'จุดวัดที่ลึกที่สุดในแต่ละเขตจาก 50 เขต' },
    'districts.count': { en: '{n} districts', th: '{n} เขต' },
    'districts.count1': { en: '1 district', th: '1 เขต' },

    'river.title': { en: 'Chao Phraya River', th: 'แม่น้ำเจ้าพระยา' },
    'river.station': { en: 'Bangkok Bridge station', th: 'สถานีสะพานกรุงเทพ' },
    'river.below': { en: '{d} m below the bank ({bank} m)', th: 'ต่ำกว่าตลิ่ง {d} ม. (ตลิ่ง {bank} ม.)' },
    'river.above': { en: '{d} m above the bank ({bank} m)', th: 'สูงกว่าตลิ่ง {d} ม. (ตลิ่ง {bank} ม.)' },

    'rain.title': { en: 'Rainfall, last 24 hours', th: 'ปริมาณฝน 24 ชั่วโมง' },
    'rain.highest': { en: 'Highest at {station}', th: 'สูงสุดที่ {station}' },
    'rain.reporting': { en: '{n} stations reporting', th: 'สถานีรายงาน {n} แห่ง' },
    'rain.class.none': { en: 'No rain', th: 'ไม่มีฝน' },
    'rain.class.light': { en: 'Light rain', th: 'ฝนเล็กน้อย' },
    'rain.class.moderate': { en: 'Moderate rain', th: 'ฝนปานกลาง' },
    'rain.class.heavy': { en: 'Heavy rain', th: 'ฝนหนัก' },
    'rain.class.veryheavy': { en: 'Very heavy rain', th: 'ฝนหนักมาก' },

    'canal.title': { en: 'Bangkok canals', th: 'คลองในกรุงเทพฯ' },
    'canal.sub': { en: '{n} canal gauges reporting', th: 'สถานีวัดคลองรายงาน {n} แห่ง' },
    'canal.unit': { en: 'gauges', th: 'แห่ง' },
    'canal.above': { en: 'at or above the bank', th: 'ระดับน้ำถึงหรือเกินตลิ่ง' },
    'canal.near': { en: '{n} more within 0.3 m of the bank', th: 'อีก {n} แห่งต่ำกว่าตลิ่งไม่ถึง 0.3 ม.' },
    'canal.closest': { en: 'Closest to its bank: {station}', th: 'ใกล้ตลิ่งที่สุด: {station}' },

    'dams.title': { en: 'Storage in the 4 main dams', th: 'ปริมาณน้ำใน 4 เขื่อนหลัก' },
    'dams.daily': { en: 'Daily data as of {date}', th: 'ข้อมูลรายวัน ณ {date}' },
    'dams.free': { en: '{pct}% of capacity still free', th: 'ยังรับน้ำได้อีก {pct}%' },

    'watch.title': { en: 'Districts to watch', th: 'เขตที่ควรติดตาม' },
    'watch.empty': { en: 'No district has road flooding of 5 cm or more right now.', th: 'ขณะนี้ไม่มีเขตที่น้ำท่วมถนนตั้งแต่ 5 ซม.' },
    'watch.depth': { en: '{d} cm at the deepest point', th: 'จุดลึกสุด {d} ซม.' },
    'watch.points': { en: '{n} road points', th: 'จุดวัด {n} จุด' },

    'error.card': { en: 'This data could not be loaded.', th: 'โหลดข้อมูลส่วนนี้ไม่ได้' },

    // Conditions near you (dialog on Home)
    'near.open': { en: 'See conditions near you', th: 'ดูสถานการณ์ใกล้คุณ' },
    'near.title': { en: 'Conditions near you', th: 'สถานการณ์ใกล้คุณ' },
    'near.close': { en: 'Close', th: 'ปิด' },
    'near.privacy': {
      en: 'Readings come from the nearest gauges, not from your exact spot. Your location is used only in this browser and is never sent or stored.',
      th: 'ข้อมูลจากจุดวัดที่ใกล้ที่สุด ไม่ใช่ที่ตำแหน่งของคุณพอดี ตำแหน่งของคุณใช้ในเบราว์เซอร์เท่านั้น ไม่ถูกส่งหรือเก็บ'
    },
    'near.locating': { en: 'Finding your location', th: 'กำลังหาตำแหน่งของคุณ' },
    'near.loading': { en: 'Loading nearby gauges', th: 'กำลังโหลดข้อมูลจุดวัด' },
    'near.denied': { en: 'Location access was declined. You can choose a district instead.', th: 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง เลือกเขตแทนได้' },
    'near.unavailable': { en: 'Your location could not be found. You can choose a district instead.', th: 'หาตำแหน่งของคุณไม่ได้ เลือกเขตแทนได้' },
    'near.timeout': { en: 'Finding your location took too long. You can choose a district instead.', th: 'หาตำแหน่งนานเกินไป เลือกเขตแทนได้' },
    'near.insecure': { en: 'This browser shares location only on a secure (HTTPS) page. You can choose a district instead.', th: 'เบราว์เซอร์ให้ใช้ตำแหน่งได้เฉพาะหน้าเว็บ HTTPS เลือกเขตแทนได้' },
    'near.outside': { en: 'This location is outside the area the system covers (Bangkok).', th: 'ตำแหน่งนี้อยู่นอกพื้นที่ที่ระบบครอบคลุม (กรุงเทพฯ)' },
    'near.error': { en: 'Road gauge data could not be loaded. Try again in a moment.', th: 'โหลดข้อมูลจุดวัดถนนไม่ได้ ลองใหม่อีกครั้ง' },
    'near.useMine': { en: 'Use my location', th: 'ใช้ตำแหน่งของฉัน' },
    'near.useSample': { en: 'Use a sample location', th: 'ใช้ตำแหน่งตัวอย่าง' },
    'near.pick': { en: 'Or choose a district', th: 'หรือเลือกเขต' },
    'near.pickNone': { en: 'Select a district', th: 'เลือกเขต' },
    'near.show': { en: 'Show', th: 'แสดง' },
    'near.whereMine': { en: 'Your current location', th: 'ตำแหน่งปัจจุบันของคุณ' },
    'near.whereSample': { en: '{station}, not your real location', th: '{station} ไม่ใช่ตำแหน่งจริงของคุณ' },
    'near.whereDistrict': { en: 'District you chose: {station}', th: 'เขตที่เลือก: {station}' },
    'near.sampleTag': { en: 'Sample location', th: 'ตำแหน่งตัวอย่าง' },
    'near.fromCentre': { en: 'Distances are measured from the middle of this district\'s road gauges.', th: 'ระยะทางวัดจากกึ่งกลางของจุดวัดถนนในเขตนี้' },
    'near.roads': { en: 'Nearest road flood gauges', th: 'จุดวัดน้ำท่วมถนนที่ใกล้ที่สุด' },
    'near.roadsDistrict': { en: 'Road flood gauges in this district', th: 'จุดวัดน้ำท่วมถนนในเขตนี้' },
    'near.noRoads': { en: 'This district has no road flood gauges.', th: 'เขตนี้ไม่มีจุดวัดน้ำท่วมถนน' },
    'near.km': { en: '{km} km away', th: 'ห่าง {km} กม.' },
    'near.cm': { en: '{d} cm', th: '{d} ซม.' },
    'near.district': { en: 'Road flooding in {station} district', th: 'น้ำท่วมถนนในเขต{station}' },
    'near.water': { en: 'Nearest canal or river gauge', th: 'สถานีวัดน้ำคลองหรือแม่น้ำที่ใกล้ที่สุด' },
    'near.bank': { en: 'Bank {bank} m', th: 'ตลิ่ง {bank} ม.' },
    'near.atBank': { en: 'At the bank', th: 'ถึงตลิ่ง' },
    'near.belowBank': { en: '{d} m below the bank', th: 'ต่ำกว่าตลิ่ง {d} ม.' },
    'near.noBank': { en: 'Bank height not reported', th: 'ไม่มีข้อมูลระดับตลิ่ง' },
    'near.rain': { en: 'Nearest rain gauge, last 24 hours', th: 'สถานีวัดฝนที่ใกล้ที่สุด 24 ชั่วโมง' },
    'near.north': { en: 'Northern runoff at Ayutthaya, not at your location', th: 'น้ำเหนือที่อยุธยา ไม่ใช่ที่ตำแหน่งของคุณ' },
    'near.rule': { en: 'Risk level from a simple rule', th: 'ระดับความเสี่ยงจากกฎง่ายๆ' },
    'near.alert': { en: 'Latest alert', th: 'แจ้งเตือนล่าสุด' },
    'near.noAlert': { en: 'No alerts have been sent.', th: 'ยังไม่มีการแจ้งเตือนที่ส่งแล้ว' },

    // Rescue reports
    'reports.title': { en: 'Rescue reports', th: 'แจ้งเหตุและติดตาม' },
    'reports.sub': { en: 'Ask for help and follow your request from submission to resolution.', th: 'แจ้งขอความช่วยเหลือ และติดตามคำขอตั้งแต่แจ้งจนเสร็จสิ้น' },
    'reports.tabs': { en: 'Rescue report views', th: 'มุมมองการแจ้งเหตุ' },
    'reports.tabNew': { en: 'Send a report', th: 'แจ้งเหตุ' },
    'reports.tabMine': { en: 'My reports', th: 'สถานะการแจ้งเหตุ' },
    'reports.emergency': {
      en: 'Life in danger? Call 1669 (medical) or 191 (police) first. This prototype is not watched around the clock.',
      th: 'มีอันตรายถึงชีวิต? โทร 1669 (การแพทย์ฉุกเฉิน) หรือ 191 (ตำรวจ) ก่อน ระบบต้นแบบนี้ไม่มีเจ้าหน้าที่เฝ้าตลอด 24 ชั่วโมง'
    },
    'reports.gateTitle': { en: 'Log in to send a rescue report', th: 'เข้าสู่ระบบเพื่อแจ้งเหตุ' },
    'reports.gateText': {
      en: 'Reports are linked to your account so you can follow each one until it is resolved. Signing up takes a minute.',
      th: 'การแจ้งเหตุผูกกับบัญชีของคุณ เพื่อให้ติดตามได้จนเสร็จสิ้น สมัครใช้งานได้ในหนึ่งนาที'
    },
    'reports.gateMineTitle': { en: 'Log in to see your reports', th: 'เข้าสู่ระบบเพื่อดูสถานะการแจ้งเหตุ' },
    'reports.gateAdmin': {
      en: 'Admin accounts cannot send or follow rescue reports. Log in with a member account.',
      th: 'บัญชีผู้ดูแลระบบแจ้งเหตุหรือติดตามการแจ้งเหตุไม่ได้ โปรดใช้บัญชีผู้ใช้ทั่วไป'
    },
    'reports.signup': { en: 'Sign up', th: 'สมัครใช้งาน' },

    'form.desc': { en: 'What is happening?', th: 'กรอกรายละเอียดเหตุการณ์' },
    'form.descHint': {
      en: 'For example: water is rising inside the house, two older people are upstairs and cannot leave.',
      th: 'เช่น น้ำท่วมสูงในบ้าน มีผู้สูงอายุ 2 คนติดอยู่ชั้นบน'
    },
    'form.count': { en: '{n} / {max}', th: '{n} / {max}' },
    'form.where': { en: 'Where are you?', th: 'ที่อยู่ของคุณ' },
    'form.whereHint': { en: 'Type an address, pin the spot on the map, or both.', th: 'พิมพ์ที่อยู่ ปักหมุดบนแผนที่ หรือทั้งสองอย่าง' },
    'form.address': { en: 'Address', th: 'ที่อยู่' },
    'form.addressPh': { en: 'House number, soi, road, subdistrict, district', th: 'บ้านเลขที่ ซอย ถนน แขวง เขต' },
    'form.map': { en: 'Map: click or tap to pin where help is needed', th: 'แผนที่: คลิกหรือแตะเพื่อปักหมุดจุดที่ต้องการความช่วยเหลือ' },
    'form.locate': { en: 'Use my location', th: 'ใช้ตำแหน่งของฉัน' },
    'form.clearPin': { en: 'Remove pin', th: 'ลบหมุด' },
    'form.noPin': { en: 'No pin yet. Click the map to add one.', th: 'ยังไม่ได้ปักหมุด คลิกบนแผนที่เพื่อปักหมุด' },
    'form.pinAt': { en: 'Pinned at {lat}, {lon}', th: 'ปักหมุดที่ {lat}, {lon}' },
    'form.pinNote': { en: 'The pin is sent with your report so rescue teams can find you.', th: 'หมุดจะส่งไปพร้อมการแจ้งเหตุ เพื่อให้ทีมช่วยเหลือหาคุณเจอ' },
    'form.locating': { en: 'Finding your location', th: 'กำลังหาตำแหน่งของคุณ' },
    'form.locateFail': { en: 'Your location could not be found. Click the map instead.', th: 'หาตำแหน่งของคุณไม่ได้ คลิกบนแผนที่แทน' },
    'form.mapOffline': { en: 'The map could not load. Type the address instead.', th: 'โหลดแผนที่ไม่ได้ โปรดพิมพ์ที่อยู่แทน' },
    'form.phone': { en: 'Contact number', th: 'เบอร์ติดต่อ' },
    'form.phoneHint': { en: 'Optional. Rescue teams may call this number.', th: 'ไม่บังคับ ทีมช่วยเหลืออาจโทรหาเบอร์นี้' },
    'form.submit': { en: 'Send report', th: 'ยืนยันและส่ง' },
    'form.sending': { en: 'Sending', th: 'กำลังส่ง' },
    'form.required': { en: 'Required', th: 'จำเป็น' },
    'form.errDesc': { en: 'Describe what is happening.', th: 'กรุณากรอกรายละเอียดเหตุการณ์' },
    'form.errWhere': { en: 'Type an address or pin the spot on the map.', th: 'กรุณาพิมพ์ที่อยู่หรือปักหมุดบนแผนที่' },
    'form.errPhone': { en: 'Enter a Thai phone number with 9 or 10 digits, like 081 234 5678.', th: 'กรอกเบอร์โทร 9 หรือ 10 หลัก เช่น 081 234 5678' },
    'form.sentTitle': { en: 'Report sent', th: 'ส่งการแจ้งเหตุแล้ว' },
    'form.sentText': {
      en: 'Report {id} is with the GunWaree team. Follow it in My reports; the status updates on its own.',
      th: 'การแจ้งเหตุ {id} ถึงทีม GunWaree แล้ว ติดตามได้ที่สถานะการแจ้งเหตุ สถานะจะอัปเดตเอง'
    },
    'form.viewMine': { en: 'Follow it in My reports', th: 'ไปที่สถานะการแจ้งเหตุ' },
    'form.another': { en: 'Send another report', th: 'แจ้งเหตุอีกครั้ง' },

    'mine.all': { en: 'All reports', th: 'ทั้งหมด' },
    'mine.listTitle': { en: 'Your reports', th: 'การแจ้งเหตุของคุณ' },
    'mine.empty': { en: 'You have not sent any reports yet.', th: 'คุณยังไม่ได้แจ้งเหตุ' },
    'mine.emptyAction': { en: 'Send a report', th: 'แจ้งเหตุ' },
    'mine.error': { en: 'Your reports could not be loaded. Retrying shortly.', th: 'โหลดการแจ้งเหตุไม่ได้ กำลังลองใหม่' },
    'mine.sent': { en: 'Sent {time}', th: 'แจ้งเมื่อ {time}' },
    'mine.changedAt': { en: 'Status changed {time}', th: 'เปลี่ยนสถานะเมื่อ {time}' },
    'mine.pinned': { en: 'Pinned location {lat}, {lon}', th: 'ตำแหน่งที่ปักหมุด {lat}, {lon}' },
    'mine.noAddress': { en: 'No address given', th: 'ไม่ได้ระบุที่อยู่' },
    'mine.progress': { en: 'Progress', th: 'ความคืบหน้า' },
    'mine.nowStatus': { en: 'Report {id} is now: {status}', th: 'การแจ้งเหตุ {id} เปลี่ยนเป็น: {status}' },

    // Dam levels
    'dams.pageTitle': { en: 'Dam levels', th: 'ระดับน้ำในเขื่อน' },
    'dams.pageSub': {
      en: 'Storage in the four main dams above Bangkok and the flow through the Chao Phraya diversion dam.',
      th: 'ปริมาณน้ำใน 4 เขื่อนหลักเหนือกรุงเทพฯ และอัตราการไหลผ่านเขื่อนเจ้าพระยา'
    },
    'dams.search': { en: 'Search dam or province', th: 'ค้นหาเขื่อนหรือจังหวัด' },
    'dams.type': { en: 'Dam type', th: 'ประเภทเขื่อน' },
    'dams.typeAll': { en: 'All types', th: 'ทุกประเภท' },
    'dams.typeRes': { en: 'Reservoirs', th: 'อ่างเก็บน้ำ' },
    'dams.typeDiv': { en: 'Diversion dam', th: 'เขื่อนทดน้ำ' },
    'dams.reservoir': { en: 'Reservoir', th: 'อ่างเก็บน้ำ' },
    'dams.diversion': { en: 'Diversion dam', th: 'เขื่อนทดน้ำ' },
    'dams.schematic': { en: 'River schematic', th: 'แผนผังแม่น้ำ' },
    'dams.north': { en: 'N', th: 'เหนือ' },
    'dams.zoomIn': { en: 'Zoom in', th: 'ขยาย' },
    'dams.zoomOut': { en: 'Zoom out', th: 'ย่อ' },
    'dams.zoomReset': { en: 'Reset view', th: 'กลับมุมมองเริ่มต้น' },
    'dams.mapNote': {
      en: 'Illustrative, not to scale. The moving water follows each dam\'s daily release.',
      th: 'แผนผังตัวอย่าง ไม่ได้ตามมาตราส่วน ความเร็วของน้ำตามปริมาณการระบายรายวันของแต่ละเขื่อน'
    },
    'dams.selectedRes': { en: 'Selected reservoir', th: 'อ่างเก็บน้ำที่เลือก' },
    'dams.selectedDiv': { en: 'Selected diversion dam', th: 'เขื่อนทดน้ำที่เลือก' },
    'dams.stored': { en: 'stored', th: 'ของความจุ' },
    'dams.volume': { en: 'Water stored', th: 'ปริมาณน้ำในอ่าง' },
    'dams.volumeOf': { en: '{v} of {c} million m³', th: '{v} จาก {c} ล้าน ลบ.ม.' },
    'dams.space': { en: 'Space left', th: 'รับน้ำได้อีก' },
    'dams.spaceVal': { en: '{v} million m³', th: '{v} ล้าน ลบ.ม.' },
    'dams.inflow': { en: 'Inflow', th: 'น้ำไหลเข้า' },
    'dams.outflow': { en: 'Release', th: 'น้ำระบาย' },
    'dams.perDay': { en: '{v} million m³/day', th: '{v} ล้าน ลบ.ม./วัน' },
    'dams.filling': { en: 'Taking in more water than it releases', th: 'น้ำไหลเข้ามากกว่าที่ระบาย' },
    'dams.draining': { en: 'Releasing more water than it takes in', th: 'ระบายน้ำมากกว่าที่ไหลเข้า' },
    'dams.discharge': { en: 'Discharge', th: 'อัตราการระบายน้ำ' },
    'dams.cms': { en: 'm³/s', th: 'ลบ.ม./วินาที' },
    'dams.noStorage': { en: 'A diversion dam holds back little water, so only its flow is reported.', th: 'เขื่อนทดน้ำเก็บกักน้ำได้น้อย จึงรายงานเฉพาะอัตราการไหล' },
    'dams.asOf': { en: 'Daily data as of {date}', th: 'ข้อมูลรายวัน ณ {date}' },
    'dams.watchlist': { en: 'Watchlist', th: 'เขื่อนที่ติดตาม' },
    'dams.watchSub': { en: '{n} dams: {r} reservoirs, {d} diversion dam', th: '{n} เขื่อน: อ่างเก็บน้ำ {r} แห่ง เขื่อนทดน้ำ {d} แห่ง' },
    'dams.colDam': { en: 'Dam', th: 'เขื่อน' },
    'dams.colProvince': { en: 'Province', th: 'จังหวัด' },
    'dams.colType': { en: 'Type', th: 'ประเภท' },
    'dams.colStorage': { en: 'Storage or flow', th: 'ปริมาณน้ำ' },
    'dams.colStatus': { en: 'Status', th: 'สถานะ' },
    'dams.pctStored': { en: '{p}% stored', th: 'น้ำในอ่าง {p}%' },
    'dams.pctFree': { en: '{p}% space left', th: 'รับได้อีก {p}%' },
    'dams.flowOnly': { en: 'Flow only', th: 'รายงานอัตราการไหล' },
    'dams.noMatch': { en: 'No dam matches your search.', th: 'ไม่พบเขื่อนที่ค้นหา' },
    'dams.scale': {
      en: 'Status uses the ThaiWater storage scale: up to 30% critically low, 30 to 50% low, 50 to 80% moderate, 80 to 100% high, over 100% over capacity.',
      th: 'สถานะใช้เกณฑ์ของ ThaiWater: ไม่เกิน 30% น้ำน้อยวิกฤต 30 ถึง 50% น้ำน้อย 50 ถึง 80% น้ำปานกลาง 80 ถึง 100% น้ำมาก เกิน 100% น้ำล้นอ่าง'
    },
    'dams.cls.critlow': { en: 'Critically low', th: 'น้ำน้อยวิกฤต' },
    'dams.cls.low': { en: 'Low', th: 'น้ำน้อย' },
    'dams.cls.moderate': { en: 'Moderate', th: 'น้ำปานกลาง' },
    'dams.cls.high': { en: 'High', th: 'น้ำมาก' },
    'dams.cls.over': { en: 'Over capacity', th: 'น้ำล้นอ่าง' },
    'dams.error': { en: 'Dam data could not be loaded.', th: 'โหลดข้อมูลเขื่อนไม่ได้' },
    'dams.select': { en: 'Show {name}', th: 'แสดง{name}' },
    'dams.mapTitle': { en: 'Dam map', th: 'แผนที่เขื่อน' },
    'dams.mapHint': { en: 'Each marker fills with the water stored behind that dam.', th: 'หมุดแต่ละอันแสดงปริมาณน้ำในอ่างของเขื่อนนั้น' },

    // Maps (OpenFreeMap tiles drawn with MapLibre)
    'map.zoomIn': { en: 'Zoom in', th: 'ขยาย' },
    'map.zoomOut': { en: 'Zoom out', th: 'ย่อ' },
    'map.reset': { en: 'Show everything', th: 'แสดงทั้งหมด' },
    'map.tilt': { en: 'Tilt the map in 3D', th: 'เอียงแผนที่แบบ 3 มิติ' },
    'map.offline': { en: 'The map could not load. Check the internet connection.', th: 'โหลดแผนที่ไม่ได้ ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต' },
    'map.gestureWin': { en: 'Use Ctrl + scroll to zoom the map', th: 'กด Ctrl ค้างแล้วเลื่อนเพื่อซูมแผนที่' },
    'map.gestureMac': { en: 'Use \u2318 + scroll to zoom the map', th: 'กด \u2318 ค้างแล้วเลื่อนเพื่อซูมแผนที่' },
    'map.gestureMobile': { en: 'Use two fingers to move the map', th: 'ใช้สองนิ้วเพื่อเลื่อนแผนที่' },

    // Water levels
    'water.title': { en: 'Water levels', th: 'ระดับน้ำคลองและแม่น้ำ' },
    'water.sub': {
      en: 'Rivers and canals around Bangkok, and flooding on roads. Gauges report every 10 to 20 minutes.',
      th: 'แม่น้ำและคลองในกรุงเทพฯ และน้ำท่วมถนน สถานีรายงานทุก 10 ถึง 20 นาที'
    },
    'water.search': { en: 'Search station, canal or district', th: 'ค้นหาสถานี คลอง หรือเขต' },
    'water.kinds': { en: 'Station type', th: 'ประเภทสถานี' },
    'water.kAll': { en: 'All', th: 'ทั้งหมด' },
    'water.kRiver': { en: 'Rivers', th: 'แม่น้ำ' },
    'water.kCanal': { en: 'Canals', th: 'คลอง' },
    'water.kRoad': { en: 'Road flooding', th: 'น้ำท่วมถนน' },
    'water.river': { en: 'River gauge', th: 'สถานีวัดแม่น้ำ' },
    'water.canal': { en: 'Canal gauge', th: 'สถานีวัดคลอง' },
    'water.road': { en: 'Road flood point', th: 'จุดวัดน้ำท่วมถนน' },
    'water.statuses': { en: 'Filter by status', th: 'กรองตามสถานะ' },
    'wst.over': { en: 'Overflowing', th: 'น้ำล้น' },
    'wst.crit': { en: 'Critical', th: 'วิกฤต' },
    'wst.warn': { en: 'Watch', th: 'เฝ้าระวัง' },
    'wst.normal': { en: 'Normal', th: 'ปกติ' },
    'wst.stale': { en: 'No recent report', th: 'ไม่มีรายงานล่าสุด' },
    'water.mapTitle': { en: 'Station map', th: 'แผนที่สถานีวัด' },
    'water.mapHint': { en: 'Select a station to see its reading.', th: 'เลือกสถานีเพื่อดูค่าที่วัดได้' },
    'water.pick': { en: 'Select a station on the map or in the list to see its reading.', th: 'เลือกสถานีบนแผนที่หรือจากรายการเพื่อดูค่าที่วัดได้' },
    'water.level': { en: 'Water level', th: 'ระดับน้ำ' },
    'water.msl': { en: 'm MSL', th: 'ม.รทก.' },
    'water.bank': { en: 'Bank', th: 'ตลิ่ง' },
    'water.warnLv': { en: 'Watch level', th: 'ระดับเฝ้าระวัง' },
    'water.critLv': { en: 'Critical level', th: 'ระดับวิกฤต' },
    'water.toBank': { en: '{d} m below the bank', th: 'ต่ำกว่าตลิ่ง {d} ม.' },
    'water.overBank': { en: '{d} m over the bank', th: 'สูงกว่าตลิ่ง {d} ม.' },
    'water.noBank': { en: 'Bank height not reported', th: 'ไม่มีข้อมูลระดับตลิ่ง' },
    'water.depth': { en: 'Flood depth on the road', th: 'ความลึกน้ำท่วมถนน' },
    'water.district': { en: 'District', th: 'เขต' },
    'water.code': { en: 'Station code', th: 'รหัสสถานี' },
    'water.stale': { en: 'No report for over 3 hours, so this reading may be out of date.', th: 'ไม่มีรายงานเกิน 3 ชั่วโมง ค่านี้อาจไม่เป็นปัจจุบัน' },
    'water.list': { en: 'Stations', th: 'สถานีวัด' },
    'water.listSub': { en: 'Most urgent first', th: 'เรียงจากที่ต้องติดตามมากที่สุด' },
    'water.showAll': { en: 'Show all {n}', th: 'แสดงทั้งหมด {n} แห่ง' },
    'water.showLess': { en: 'Show fewer', th: 'แสดงน้อยลง' },
    'water.noMatch': { en: 'No station matches your search.', th: 'ไม่พบสถานีที่ค้นหา' },
    'water.count': { en: '{n} stations', th: '{n} สถานี' },
    'water.legend': {
      en: 'Rivers and canals: overflowing means at or over the bank; critical and watch use the Bangkok Drainage Office levels where a gauge has them. Roads: overflowing is 30 cm or deeper, critical over 10 cm, watch 5 to 10 cm.',
      th: 'แม่น้ำและคลอง: น้ำล้นคือระดับน้ำถึงหรือเกินตลิ่ง ระดับวิกฤตและเฝ้าระวังใช้เกณฑ์ของสำนักการระบายน้ำเมื่อสถานีมีค่านี้ ถนน: น้ำล้นคือลึกตั้งแต่ 30 ซม. วิกฤตเกิน 10 ซม. เฝ้าระวัง 5 ถึง 10 ซม.'
    },
    'water.kit': { en: 'GunWaree test sensor', th: 'ชุดทดลอง GunWaree' },
    'water.kitSub': { en: 'Our ESP32 prototype gauge, not a public station.', th: 'เครื่องวัดต้นแบบ ESP32 ของทีม ไม่ใช่สถานีสาธารณะ' },
    'kit.green': { en: 'Normal', th: 'ปกติ' },
    'kit.yellow': { en: 'Watch', th: 'เฝ้าระวัง' },
    'kit.red': { en: 'Critical', th: 'วิกฤต' },
    'water.error': { en: 'Station data could not be loaded.', th: 'โหลดข้อมูลสถานีไม่ได้' },
    'water.cm': { en: '{d} cm', th: '{d} ซม.' },

    // Risk prediction (rule B2 in backend/risk.py)
    'rp.title': { en: 'Rule-based risk level', th: 'ระดับความเสี่ยงตามกฎ' },
    'rp.sub': {
      en: 'Will the Chao Phraya at Ayutthaya reach its bank within the next 24 hours?',
      th: 'แม่น้ำเจ้าพระยาที่อยุธยาจะถึงตลิ่งภายใน 24 ชั่วโมงข้างหน้าหรือไม่'
    },
    'rp.loading': { en: 'Checking the river…', th: 'กำลังตรวจระดับน้ำ…' },
    'rp.official2': { en: 'Follow guidance from the DDPM and the BMA.', th: 'โปรดปฏิบัติตามคำแนะนำของ ปภ. และ กทม.' },
    'rp.f.where': { en: 'Station', th: 'สถานี' },
    'rp.f.until': { en: 'Looks ahead to', th: 'มองไปข้างหน้าถึง' },
    'rp.f.ran': { en: 'Checked', th: 'ประเมินเมื่อ' },
    'rp.f.reading': { en: 'Reading used', th: 'ค่าที่ใช้ประเมิน' },
    'rp.f.next': { en: 'Next check', th: 'ตรวจครั้งถัดไป' },
    'rp.in': { en: 'in {t}', th: 'อีก {t}' },
    'rp.d.bank': { en: 'Bank {v} m', th: 'ตลิ่ง {v} ม.' },
    'rp.d.watch': { en: 'Watch line {v} m', th: 'เส้นเฝ้าระวัง {v} ม.' },
    'rp.d.now': { en: 'Now {v} m', th: 'ตอนนี้ {v} ม.' },
    'rp.d.none': { en: 'No recent reading', th: 'ไม่มีค่าล่าสุด' },
    'rp.d.hint': { en: 'Move the pointer over the river to turn it.', th: 'เลื่อนเมาส์บนภาพแม่น้ำเพื่อหมุนดู' },
    'rp.d.alt': {
      en: 'Cross-section of the river at Ayutthaya: water at {wl} m, watch line at {watch} m, bank at {bank} m.',
      th: 'ภาพตัดขวางแม่น้ำที่อยุธยา: ระดับน้ำ {wl} ม. เส้นเฝ้าระวัง {watch} ม. ตลิ่ง {bank} ม.'
    },

    'rp.ruleTitle': { en: 'How the level is decided', th: 'ระดับความเสี่ยงตัดสินอย่างไร' },
    'rp.ruleSub': {
      en: 'Rule B2 checks the latest reading at Ayutthaya from the top down and stops at the first match.',
      th: 'กฎ B2 ตรวจค่าล่าสุดที่อยุธยาจากบนลงล่าง และหยุดที่ข้อแรกที่ตรง'
    },
    'rp.cond.critical': { en: 'The river is at or over its bank ({bank} m).', th: 'ระดับน้ำถึงหรือเกินตลิ่ง ({bank} ม.)' },
    'rp.cond.warning': { en: 'Above the watch line ({watch} m) and higher than 6 hours earlier.', th: 'สูงกว่าเส้นเฝ้าระวัง ({watch} ม.) และสูงกว่าเมื่อ 6 ชั่วโมงก่อน' },
    'rp.cond.watch': {
      en: 'Above the watch line, but not rising, or no reading from 6 hours earlier to compare.',
      th: 'สูงกว่าเส้นเฝ้าระวัง แต่ไม่ได้สูงขึ้น หรือไม่มีค่าเมื่อ 6 ชั่วโมงก่อนให้เทียบ'
    },
    'rp.cond.none': { en: 'At or below the watch line ({watch} m).', th: 'เท่ากับหรือต่ำกว่าเส้นเฝ้าระวัง ({watch} ม.)' },
    'rp.now': { en: 'Now', th: 'ตอนนี้' },
    'rp.whyTitle': { en: 'Why {level} now', th: 'ทำไมตอนนี้เป็นระดับ{level}' },
    'rp.q.bank': { en: 'At or over the bank ({bank} m)?', th: 'ถึงหรือเกินตลิ่ง ({bank} ม.) หรือไม่' },
    'rp.q.watch': { en: 'Above the watch line ({watch} m)?', th: 'สูงกว่าเส้นเฝ้าระวัง ({watch} ม.) หรือไม่' },
    'rp.q.rise': { en: 'Higher than 6 hours earlier?', th: 'สูงกว่าเมื่อ 6 ชั่วโมงก่อนหรือไม่' },
    'rp.a.yes': { en: 'Yes', th: 'ใช่' },
    'rp.a.no': { en: 'No', th: 'ไม่ใช่' },
    'rp.a.noOrNone': { en: 'No, or nothing to compare', th: 'ไม่ใช่ หรือไม่มีค่าให้เทียบ' },
    'rp.a.skip': { en: 'Not checked', th: 'ไม่ต้องตรวจ' },
    'rp.whyNoData': {
      en: 'There is no reading from Ayutthaya in the last 3 hours, so the rule does not guess.',
      th: 'ไม่มีค่าจากอยุธยาใน 3 ชั่วโมงที่ผ่านมา กฎจึงไม่ประเมิน'
    },
    'rp.watchLine': {
      en: 'The watch line is 0.30 m below the bank. That margin was picked from the 2020 to 2024 records.',
      th: 'เส้นเฝ้าระวังอยู่ต่ำกว่าตลิ่ง 0.30 ม. ค่านี้เลือกจากข้อมูลปี 2020 ถึง 2024'
    },

    'rp.inTitle': { en: 'What the rule looked at', th: 'ข้อมูลที่กฎใช้' },
    'rp.inSub': { en: 'River level at Ayutthaya (station 39), in metres above mean sea level', th: 'ระดับน้ำที่อยุธยา (สถานี 39) หน่วยเมตร รทก.' },
    'rp.in.level': { en: 'Water level', th: 'ระดับน้ำ' },
    'rp.in.bank': { en: 'Bank', th: 'ตลิ่ง' },
    'rp.in.watch': { en: 'Watch line', th: 'เส้นเฝ้าระวัง' },
    'rp.in.gap': { en: 'To the bank', th: 'ห่างจากตลิ่ง' },
    'rp.in.below': { en: '{d} m below', th: 'ต่ำกว่า {d} ม.' },
    'rp.in.over': { en: '{d} m over', th: 'เกิน {d} ม.' },
    'rp.in.trend': { en: '6-hour trend', th: 'แนวโน้ม 6 ชั่วโมง' },
    'rp.trend.warning': { en: 'Rising: higher than 6 hours earlier', th: 'กำลังสูงขึ้น: สูงกว่าเมื่อ 6 ชั่วโมงก่อน' },
    'rp.trend.watch': { en: 'Not rising, or no reading from 6 hours earlier', th: 'ไม่ได้สูงขึ้น หรือไม่มีค่าเมื่อ 6 ชั่วโมงก่อน' },
    'rp.trend.other': { en: 'Not needed at this level', th: 'ระดับนี้ไม่ต้องใช้' },
    'rp.trend.unknown': { en: 'Shown once the rule has run', th: 'แสดงเมื่อกฎประเมินแล้ว' },
    'rp.trendNote': {
      en: 'The server does not send the 6-hour change itself; this follows from the level.',
      th: 'เซิร์ฟเวอร์ไม่ได้ส่งค่าการเปลี่ยนแปลง 6 ชั่วโมงมา ข้อความนี้อนุมานจากระดับความเสี่ยง'
    },
    'rp.same': { en: 'The rule used this same reading.', th: 'กฎใช้ค่านี้ในการประเมิน' },
    'rp.diff': {
      en: 'The rule used the reading from {time}. The one shown here was taken at another time, or was set aside as an odd jump.',
      th: 'กฎใช้ค่าเมื่อ {time} ค่าที่แสดงนี้วัดคนละเวลา หรือถูกกันออกเพราะกระโดดผิดปกติ'
    },
    'rp.stale': { en: 'No report for over 3 hours', th: 'ไม่มีรายงานเกิน 3 ชั่วโมง' },

    'rp.alongTitle': { en: 'Along the Chao Phraya', th: 'ตลอดแม่น้ำเจ้าพระยา' },
    'rp.alongSub': { en: 'North to south. Context only: the rule uses Ayutthaya alone.', th: 'เรียงจากเหนือลงใต้ ใช้ประกอบเท่านั้น กฎใช้เฉพาะอยุธยา' },
    'rp.st568': { en: 'Nakhon Sawan, Dechatiwong Bridge', th: 'นครสวรรค์ สะพานเดชาติวงศ์' },
    'rp.st39': { en: 'Ayutthaya', th: 'พระนครศรีอยุธยา' },
    'rp.st4': { en: 'Bangkok Bridge', th: 'สะพานกรุงเทพ' },
    'rp.up': { en: 'Upstream', th: 'เหนือน้ำ' },
    'rp.target': { en: 'Station the rule uses', th: 'สถานีที่กฎใช้' },
    'rp.down': { en: 'Bangkok', th: 'กรุงเทพฯ' },
    'rp.readingOnly': { en: '{wl} m MSL', th: '{wl} ม.รทก.' },

    'rp.trackTitle': { en: 'How it did on past floods', th: 'ผลย้อนหลังกับน้ำท่วมจริง' },
    'rp.trackSub': { en: 'Hours of warning before the river first reached its bank at Ayutthaya', th: 'เตือนล่วงหน้ากี่ชั่วโมงก่อนน้ำถึงตลิ่งที่อยุธยาครั้งแรก' },
    'rp.k.watch': { en: 'Watch or higher', th: 'ระดับเฝ้าระวังขึ้นไป' },
    'rp.k.warning': { en: 'Warning or higher', th: 'ระดับเตือนภัยขึ้นไป' },
    'rp.k.late': { en: 'Too late', th: 'เตือนช้า' },
    'rp.early': { en: '{h} h ahead', th: 'ก่อน {h} ชม.' },
    'rp.late': { en: '{h} h late', th: 'ช้า {h} ชม.' },
    'rp.hours': { en: '{h} h', th: '{h} ชม.' },
    'rp.atBank': { en: 'Reached the bank {time}', th: 'ถึงตลิ่ง {time}' },
    'rp.tag.test': { en: 'Independent test', th: 'ทดสอบอิสระ' },
    'rp.tag.tune': { en: 'Helped pick the margin', th: 'ใช้เลือกค่าเกณฑ์' },
    'rp.trackSum': {
      en: 'Warned before the bank was reached in 4 of 5 floods at Watch or higher, and 3 of 5 at Warning or higher. The misses were floods that climbed from below the watch line to the bank within a few hours.',
      th: 'เตือนก่อนน้ำถึงตลิ่ง 4 จาก 5 เหตุการณ์ที่ระดับเฝ้าระวังขึ้นไป และ 3 จาก 5 ที่ระดับเตือนภัยขึ้นไป ครั้งที่พลาดคือน้ำขึ้นจากต่ำกว่าเส้นเฝ้าระวังถึงตลิ่งภายในไม่กี่ชั่วโมง'
    },
    'rp.trackNote': {
      en: 'Only 5 floods reached the bank at Ayutthaya from 2020 to 2025, so these are examples, not an accuracy score. 2021 and 2022 were used to pick the 0.30 m margin, so they look better than new data would; 2025 was checked once and nothing was changed afterwards. The search looked back at most 72 hours, so values near 72 are capped. In 2025 the rule also gave Warning or higher on 9 days when the bank was not reached within the next 24 hours.',
      th: 'อยุธยามีน้ำถึงตลิ่งเพียง 5 เหตุการณ์ในปี 2020 ถึง 2025 ตัวเลขนี้จึงเป็นตัวอย่าง ไม่ใช่คะแนนความแม่นยำ ปี 2021 และ 2022 ใช้เลือกค่า 0.30 ม. จึงดูดีกว่าข้อมูลใหม่ ส่วนปี 2025 ตรวจครั้งเดียวและไม่ได้ปรับอะไรตามผล การค้นย้อนหลังได้ไม่เกิน 72 ชั่วโมง ค่าที่ใกล้ 72 จึงถูกตัดที่ขอบ ในปี 2025 กฎยังให้ระดับเตือนภัยขึ้นไป 9 วันที่น้ำไม่ถึงตลิ่งภายใน 24 ชั่วโมงถัดมา'
    },

    'rp.logTitle': { en: 'Recent risk checks', th: 'ผลประเมินล่าสุด' },
    'rp.logSub': { en: 'Admins only. The server stores one row each time the risk is checked.', th: 'เฉพาะผู้ดูแลระบบ เซิร์ฟเวอร์บันทึกหนึ่งแถวทุกครั้งที่ประเมินความเสี่ยง' },
    'rp.logEmpty': { en: 'No risk checks stored yet.', th: 'ยังไม่มีผลประเมินที่บันทึกไว้' },
    'rp.logError': { en: 'The risk check log could not be loaded.', th: 'โหลดบันทึกผลประเมินไม่ได้' },
    'rp.logRange': { en: 'Last {n}, from {from} to {to}', th: '{n} รายการล่าสุด ตั้งแต่ {from} ถึง {to}' },
    'rp.logOutcome': { en: '{n} with a recorded outcome', th: 'มีผลจริงบันทึกแล้ว {n} รายการ' },

    'rp.limTitle': { en: 'What this is, and what it is not', th: 'ระบบนี้คืออะไร และไม่ใช่อะไร' },
    'rp.l1t': { en: 'A rule, not an AI model', th: 'เป็นกฎ ไม่ใช่โมเดล AI' },
    'rp.l1': {
      en: 'We tested three machine-learning models, but Ayutthaya had only 5 real floods from 2020 to 2025, too few to show that any of them beats this rule. Every risk check is stored, so a model can be checked against real outcomes later.',
      th: 'เราทดสอบโมเดล machine learning 3 แบบ แต่อยุธยามีน้ำท่วมจริงเพียง 5 ครั้งในปี 2020 ถึง 2025 น้อยเกินกว่าจะพิสูจน์ว่าโมเดลใดดีกว่ากฎนี้ ระบบบันทึกผลประเมินทุกครั้งไว้เทียบกับผลจริงภายหลัง'
    },
    'rp.l2t': { en: 'A level, not a probability', th: 'เป็นระดับ ไม่ใช่ความน่าจะเป็น' },
    'rp.l2': {
      en: 'There are only four levels. The server also sends them as 0, 33, 67 or 100, but that number is the level, not a chance of flooding.',
      th: 'มีเพียง 4 ระดับ เซิร์ฟเวอร์ส่งเป็นตัวเลข 0, 33, 67 หรือ 100 ด้วย แต่ตัวเลขนั้นคือระดับ ไม่ใช่โอกาสเกิดน้ำท่วม'
    },
    'rp.l3t': { en: 'Ayutthaya, not your street', th: 'อยุธยา ไม่ใช่ถนนหน้าบ้านคุณ' },
    'rp.l3': {
      en: 'It watches water from the north arriving at Ayutthaya. It does not predict flooding on roads in Bangkok; Water levels shows that.',
      th: 'ระบบดูน้ำเหนือที่มาถึงอยุธยา ไม่ได้ทำนายน้ำท่วมถนนในกรุงเทพฯ ดูได้ที่หน้าระดับน้ำคลองและแม่น้ำ'
    },
    'rp.l4t': { en: 'Odd readings are set aside', th: 'ค่าที่ผิดปกติถูกกันออก' },
    'rp.l4': {
      en: 'If the newest reading jumps more than 1 m from the median of the readings before it (up to 4 from the last 6 hours, at least 3 needed), the rule uses that median instead.',
      th: 'หากค่าล่าสุดต่างจากค่ามัธยฐานของค่าก่อนหน้า (สูงสุด 4 ค่าใน 6 ชั่วโมง ต้องมีอย่างน้อย 3 ค่า) เกิน 1 ม. กฎจะใช้ค่ามัธยฐานนั้นแทน'
    },
    'rp.l5t': { en: 'No reading, no guess', th: 'ไม่มีข้อมูล ไม่เดา' },
    'rp.l5': {
      en: 'If Ayutthaya has not reported for 3 hours, no level is shown at all.',
      th: 'หากอยุธยาไม่ได้รายงานค่าเกิน 3 ชั่วโมง จะไม่แสดงระดับความเสี่ยงเลย'
    },
    'rp.l6t': { en: 'Fast rises can slip through', th: 'น้ำขึ้นเร็วอาจเตือนไม่ทัน' },
    'rp.l6': {
      en: 'A fixed line can fall behind when the river climbs from below the watch line to the bank in a few hours. This is not an official warning: follow the DDPM and the BMA.',
      th: 'เส้นเกณฑ์คงที่อาจตามไม่ทันเมื่อน้ำขึ้นจากต่ำกว่าเส้นเฝ้าระวังถึงตลิ่งภายในไม่กี่ชั่วโมง ระบบนี้ไม่ใช่ประกาศเตือนภัยทางการ โปรดปฏิบัติตาม ปภ. และ กทม.'
    },

    // Notice shown when Dam levels or Water levels opens
    'notice.title': { en: 'Before you look: some readings may be missing', th: 'ก่อนเริ่มดู: ข้อมูลบางส่วนอาจยังไม่ครบ' },
    'notice.body': {
      en: 'We only show what the gauges and dam operators actually send us. When a reading has not arrived yet, you will see \u201cAwaiting report\u201d or \u201cNo recent report\u201d instead of a number, because we would rather leave a gap than show you a guess.',
      th: 'เราแสดงเฉพาะค่าที่สถานีวัดและหน่วยงานดูแลเขื่อนส่งมาจริงเท่านั้น หากค่าใดยังมาไม่ถึง คุณจะเห็นคำว่า \u201cรอการรายงาน\u201d หรือ \u201cไม่มีรายงานล่าสุด\u201d แทนตัวเลข เพราะเราเลือกที่จะเว้นว่างไว้ ดีกว่าแสดงตัวเลขที่เดาขึ้นมาเอง'
    },
    'notice.sorry': {
      en: 'We are sorry if a missing figure makes things harder for you, and we are grateful for your patience while the data catches up.',
      th: 'ขออภัยหากข้อมูลที่ขาดหายทำให้คุณไม่สะดวก และขอบคุณที่อดทนรอระหว่างที่ข้อมูลกำลังตามมา'
    },
    'notice.dont': { en: 'Do not show this again on this device', th: 'ไม่ต้องแสดงอีกบนอุปกรณ์นี้' },
    'notice.ok': { en: 'I understand', th: 'รับทราบ' },
    'status.paused': { en: 'Updates paused while you read', th: 'หยุดอัปเดตชั่วคราวขณะคุณอ่าน' }
  };

  // English names for the fixed places the backend returns in Thai
  GW.PLACE_EN = {
    'ภูมิพล': 'Bhumibol',
    'สิริกิติ์': 'Sirikit',
    'แควน้อยบำรุงแดน': 'Khwae Noi Bamrung Dan',
    'ป่าสักชลสิทธิ์': 'Pasak Jolasid',
    'เจ้าพระยา': 'Chao Phraya',
    'ตาก': 'Tak',
    'อุตรดิตถ์': 'Uttaradit',
    'พิษณุโลก': 'Phitsanulok',
    'ลพบุรี': 'Lopburi',
    'ชัยนาท': 'Chai Nat',
    'นครสวรรค์': 'Nakhon Sawan',
    'พระนครศรีอยุธยา': 'Ayutthaya',
    'กรุงเทพมหานคร': 'Bangkok'
  };

  function detect() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === 'th' || saved === 'en') return saved;
    } catch (e) { /* storage blocked */ }
    var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
    return /^th\b/i.test(langs[0] || '') ? 'th' : 'en';
  }

  var current = detect();

  function fill(str, vars) {
    return !vars ? str : str.replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] === undefined || vars[k] === null ? m : vars[k];
    });
  }

  GW.lang = {
    get: function () { return current; },

    // Text for a key in the current language, with {placeholders} filled in
    t: function (key, vars) {
      var entry = GW.STR[key];
      if (!entry) return key;
      return fill(entry[current] || entry.en, vars);
    },

    // Pick from any {en, th} object (for messages in i18n.js)
    pick: function (msg) {
      return msg ? (msg[current] || msg.en) : '';
    },

    set: function (lang) {
      if (lang !== 'th' && lang !== 'en') return;
      current = lang;
      try { localStorage.setItem(KEY, lang); } catch (e) { /* storage blocked */ }
      apply();
    }
  };

  function apply() {
    var root = document.documentElement;
    root.lang = current;
    root.setAttribute('data-lang', current);

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = GW.lang.t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', GW.lang.t(el.getAttribute('data-i18n-ph')));
    });
    document.querySelectorAll('[data-i18n-tip]').forEach(function (el) {
      el.setAttribute('data-tip', GW.lang.t(el.getAttribute('data-i18n-tip')));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', GW.lang.t(el.getAttribute('data-i18n-aria')));
    });
    document.querySelectorAll('[data-lang-btn]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-lang-btn') === current));
    });

    document.dispatchEvent(new CustomEvent('gw:lang', { detail: { lang: current } }));
  }

  // Re-apply the current language, e.g. after a page adds its own strings to GW.STR
  GW.lang.refresh = apply;

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-lang-btn]');
    if (btn) GW.lang.set(btn.getAttribute('data-lang-btn'));
  });

  apply();
})(window.GW = window.GW || {});
