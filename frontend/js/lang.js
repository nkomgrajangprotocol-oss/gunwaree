/* GunWaree language switch: Thai or English, one at a time.
   Default follows the visitor's system language (Thai system -> Thai, anything else -> English);
   a choice made with the [TH|EN] switch is remembered on this device.

   Markup hooks
     data-i18n="key"             text content
     data-i18n-aria="key"        aria-label
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
    'nav.risk': { en: 'Risk prediction', th: 'พยากรณ์ความเสี่ยง' },
    'nav.reports': { en: 'Rescue reports', th: 'แจ้งเหตุและติดตาม' },
    'nav.dams': { en: 'Dam levels', th: 'ระดับน้ำในเขื่อน' },
    'nav.soon': { en: 'Soon', th: 'เร็วๆ นี้' },
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
    'status.sampleHint': { en: 'Could not reach the GunWaree server at {url}. Retrying every 15 seconds.', th: 'เชื่อมต่อเซิร์ฟเวอร์ GunWaree ที่ {url} ไม่ได้ กำลังลองใหม่ทุก 15 วินาที' },

    // Home
    'home.title': { en: 'Flood overview', th: 'ภาพรวมน้ำท่วม' },
    'hero.region': { en: 'Central Thailand', th: 'ภาคกลาง' },
    'hero.city': { en: 'Bangkok', th: 'กรุงเทพมหานคร' },
    'hero.basin': { en: 'Bangkok and the Chao Phraya River basin', th: 'กรุงเทพฯ และลุ่มน้ำเจ้าพระยา' },
    'hero.note': { en: 'A clearer view of the water around you.', th: 'ติดตามสถานการณ์น้ำรอบตัวคุณ' },

    'risk.label': { en: 'Model-estimated risk score', th: 'คะแนนความเสี่ยงที่โมเดลประเมิน' },
    'risk.target': { en: 'Ayutthaya (station 39), next 24 hours', th: 'พระนครศรีอยุธยา (สถานี 39) ภายใน 24 ชั่วโมง' },
    'risk.reading': { en: 'Water {wl} m, bank {bank} m', th: 'ระดับน้ำ {wl} ม. ตลิ่ง {bank} ม.' },
    'risk.nodata': { en: 'No data to assess yet', th: 'ยังไม่มีข้อมูลให้ประเมิน' },
    'risk.official': { en: 'Not an official warning', th: 'ไม่ใช่ประกาศเตือนภัยทางการ' },
    'risk.desc.none': { en: 'The river at Ayutthaya is below the watch level.', th: 'ระดับน้ำที่อยุธยาต่ำกว่าระดับเฝ้าระวัง' },
    'risk.desc.watch': { en: 'The river is close to its bank. Keep an eye on updates.', th: 'ระดับน้ำใกล้ตลิ่ง ติดตามข่าวสารอย่างใกล้ชิด' },
    'risk.desc.warning': { en: 'The river is close to its bank and rising. Prepare to move belongings higher.', th: 'ระดับน้ำใกล้ตลิ่งและกำลังสูงขึ้น เตรียมยกของขึ้นที่สูง' },
    'risk.desc.critical': { en: 'The river has reached its bank. Follow official evacuation guidance.', th: 'ระดับน้ำถึงตลิ่งแล้ว ปฏิบัติตามคำแนะนำการอพยพของหน่วยงาน' },

    'banner.advisory': { en: 'Risk score at {level} for the river at Ayutthaya', th: 'คะแนนความเสี่ยงระดับ{level} สำหรับแม่น้ำที่อยุธยา' },
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
    'dams.select': { en: 'Show {name}', th: 'แสดง{name}' }
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
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', GW.lang.t(el.getAttribute('data-i18n-aria')));
    });
    document.querySelectorAll('[data-lang-btn]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-lang-btn') === current));
    });

    document.dispatchEvent(new CustomEvent('gw:lang', { detail: { lang: current } }));
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-lang-btn]');
    if (btn) GW.lang.set(btn.getAttribute('data-lang-btn'));
  });

  apply();
})(window.GW = window.GW || {});
