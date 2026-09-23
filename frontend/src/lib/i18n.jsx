import React, { createContext, useContext, useState, useCallback } from 'react';

// English and Tamil are complete for the operator-facing chrome, alerts and training.
// Hindi and Telugu cover navigation and headline strings; anything missing falls back to English.
const dict = {
  en: {
    'nav.overview': 'Overview', 'nav.machine': 'Live Machine', 'nav.tasks': 'Tasks', 'nav.safety': 'Safety Center',
    'nav.twin': 'Operator Twin', 'nav.training': 'Training Hub', 'nav.sim': '3D Simulator', 'nav.replay': 'Safety Replay',
    'nav.whatif': 'What-if', 'nav.analytics': 'Analytics',
    'op.role': 'Operator', 'op.onduty': 'On Duty',
    'hdr.online': 'Online', 'hdr.shift': 'Morning shift', 'hdr.demo': 'Demo event',
    'greet.morning': 'Good morning, Operator', 'greet.afternoon': 'Good afternoon, Operator', 'greet.evening': 'Good evening, Operator',
    'ov.today': "Today's operation", 'ov.current': 'Current task', 'ov.eta': 'Estimated completion', 'ov.range': 'Expected range',
    'ov.safety': 'Safety status', 'ov.twin': 'Operator digital twin', 'ov.machine': 'Live machine',
    'lvl.low': 'Low risk', 'lvl.medium': 'Medium risk', 'lvl.high': 'High risk',
    'lvl.short.low': 'LOW', 'lvl.short.medium': 'MEDIUM', 'lvl.short.high': 'HIGH',
    'f.proximity': 'Proximity', 'f.seatbelt': 'Seatbelt', 'f.terrain': 'Terrain', 'f.control': 'Machine control', 'f.load': 'Load',
    'f.speed': 'Speed', 'f.machine': 'Machine', 'f.environment': 'Environment', 'f.visibility': 'Visibility', 'f.distance': 'Distance', 'f.slope': 'Ground slope',
    's.safe': 'Safe', 's.fastened': 'Fastened', 's.moderate': 'Moderate', 's.stable': 'Stable', 's.normal': 'Normal',
    'alert.title': 'Potential proximity risk',
    'alert.body': "A worker has entered the machine's restricted operating zone.",
    'alert.conditions': 'Current conditions', 'alert.why': 'Why this matters', 'alert.action': 'Recommended action',
    'alert.r1': 'Proximity is decreasing', 'alert.r2': 'Machine speed is elevated', 'alert.r3': 'Terrain slope is increasing',
    'alert.rec': 'Reduce speed and verify surroundings.',
    'btn.why': 'View why', 'btn.simulate': 'Simulate safer action', 'btn.take': 'Take action', 'btn.dismiss': 'Dismiss',
    'why.title': 'Risk contribution', 'why.top': 'is currently the strongest contributor to the predicted risk.',
    'train.title': 'Operator Training Hub', 'train.sub': 'Training adapted to your operating behavior.',
    'train.rec': 'Recommended for you', 'train.based': 'Based on your recent activity',
    'mod.blind': 'Blind-Zone Awareness', 'mod.idle': 'Reducing Excessive Idling', 'mod.slope': 'Safe Slope Operation',
    'sub.1': 'Before moving, look around the whole machine — not just ahead.',
    'sub.2': 'Workers can stand inside zones the mirrors and camera cannot see.',
    'sub.3': 'Always verify the area around the machine before moving.',
    'sub.4': 'If a worker enters the restricted zone, stop and make eye contact.',
    'sub.5': 'Resume only when the zone is clear and the worker has signalled.',
    'qc.title': 'Quick check', 'qc.q': 'What should the operator do when a worker enters the restricted zone?',
    'qc.a': 'Continue at the same speed', 'qc.b': 'Sound the horn and keep working', 'qc.c': 'Stop and verify surroundings', 'qc.d': 'Reverse immediately',
    'sim.q': 'What would you do?', 'sim.scenario': 'A worker has entered the operating zone.',
    'sim.a': 'Continue operation', 'sim.b': 'Reduce speed', 'sim.c': 'Stop and verify surroundings', 'sim.d': 'Reverse immediately',
    'disclaimer': 'Scenario simulation — not a guarantee of real-world outcome.',
  },
  ta: {
    'nav.overview': 'மேலோட்டம்', 'nav.machine': 'நேரடி இயந்திரம்', 'nav.tasks': 'பணிகள்', 'nav.safety': 'பாதுகாப்பு மையம்',
    'nav.twin': 'இயக்குநர் இரட்டை', 'nav.training': 'பயிற்சி மையம்', 'nav.sim': '3D உருவகப்படுத்தி', 'nav.replay': 'பாதுகாப்பு மறுஒளிபரப்பு',
    'nav.whatif': 'என்ன-ஆனால்', 'nav.analytics': 'பகுப்பாய்வு',
    'op.role': 'இயக்குநர்', 'op.onduty': 'பணியில்',
    'hdr.online': 'இணைப்பில்', 'hdr.shift': 'காலை ஷிப்ட்', 'hdr.demo': 'டெமோ நிகழ்வு',
    'greet.morning': 'காலை வணக்கம், இயக்குநரே', 'greet.afternoon': 'மதிய வணக்கம், இயக்குநரே', 'greet.evening': 'மாலை வணக்கம், இயக்குநரே',
    'ov.today': 'இன்றைய செயல்பாடு', 'ov.current': 'தற்போதைய பணி', 'ov.eta': 'மதிப்பிடப்பட்ட நிறைவு', 'ov.range': 'எதிர்பார்க்கப்படும் வரம்பு',
    'ov.safety': 'பாதுகாப்பு நிலை', 'ov.twin': 'இயக்குநர் டிஜிட்டல் இரட்டை', 'ov.machine': 'நேரடி இயந்திரம்',
    'lvl.low': 'குறைந்த அபாயம்', 'lvl.medium': 'நடுத்தர அபாயம்', 'lvl.high': 'அதிக அபாயம்',
    'lvl.short.low': 'குறைவு', 'lvl.short.medium': 'நடுத்தரம்', 'lvl.short.high': 'அதிகம்',
    'f.proximity': 'அருகாமை', 'f.seatbelt': 'இருக்கை பட்டை', 'f.terrain': 'நிலப்பரப்பு', 'f.control': 'இயந்திரக் கட்டுப்பாடு', 'f.load': 'சுமை',
    'f.speed': 'வேகம்', 'f.machine': 'இயந்திரம்', 'f.environment': 'சூழல்', 'f.visibility': 'தெரிவுநிலை', 'f.distance': 'தூரம்', 'f.slope': 'நிலச் சரிவு',
    's.safe': 'பாதுகாப்பானது', 's.fastened': 'அணியப்பட்டது', 's.moderate': 'மிதமானது', 's.stable': 'நிலையானது', 's.normal': 'இயல்பானது',
    'alert.title': 'அருகாமை அபாயம் சாத்தியம்',
    'alert.body': 'இயந்திரத்தின் தடைசெய்யப்பட்ட இயக்கப் பகுதிக்குள் ஒரு தொழிலாளர் நுழைந்துள்ளார்.',
    'alert.conditions': 'தற்போதைய நிலைமைகள்', 'alert.why': 'இது ஏன் முக்கியம்', 'alert.action': 'பரிந்துரைக்கப்படும் நடவடிக்கை',
    'alert.r1': 'அருகாமை குறைந்து வருகிறது', 'alert.r2': 'இயந்திர வேகம் அதிகமாக உள்ளது', 'alert.r3': 'நிலச் சரிவு அதிகரித்து வருகிறது',
    'alert.rec': 'வேகத்தைக் குறைத்து சுற்றுப்புறத்தைச் சரிபார்க்கவும்.',
    'btn.why': 'ஏன் என்று காண்க', 'btn.simulate': 'பாதுகாப்பான செயலை உருவகப்படுத்து', 'btn.take': 'நடவடிக்கை எடு', 'btn.dismiss': 'நிராகரி',
    'why.title': 'அபாயப் பங்களிப்பு', 'why.top': 'தற்போது கணிக்கப்பட்ட அபாயத்திற்கு மிகப்பெரிய பங்களிப்பாகும்.',
    'train.title': 'இயக்குநர் பயிற்சி மையம்', 'train.sub': 'உங்கள் இயக்க நடத்தைக்கு ஏற்ப அமைக்கப்பட்ட பயிற்சி.',
    'train.rec': 'உங்களுக்கான பரிந்துரைகள்', 'train.based': 'உங்கள் சமீபத்திய செயல்பாட்டின் அடிப்படையில்',
    'mod.blind': 'குருட்டு மண்டல விழிப்புணர்வு', 'mod.idle': 'அதிகப்படியான ஐட்லிங்கைக் குறைத்தல்', 'mod.slope': 'பாதுகாப்பான சரிவு இயக்கம்',
    'sub.1': 'நகர்வதற்கு முன், முன்னால் மட்டுமல்ல — இயந்திரம் முழுவதையும் சுற்றிப் பாருங்கள்.',
    'sub.2': 'கண்ணாடிகளும் கேமராவும் பார்க்க முடியாத இடங்களில் தொழிலாளர்கள் நிற்கலாம்.',
    'sub.3': 'நகர்வதற்கு முன் இயந்திரத்தைச் சுற்றியுள்ள பகுதியை எப்போதும் சரிபார்க்கவும்.',
    'sub.4': 'தொழிலாளர் தடைசெய்யப்பட்ட பகுதிக்குள் வந்தால், நிறுத்தி கண் தொடர்பு கொள்ளுங்கள்.',
    'sub.5': 'பகுதி தெளிவாகி தொழிலாளர் சைகை காட்டிய பின்னரே மீண்டும் தொடருங்கள்.',
    'qc.title': 'விரைவுச் சோதனை', 'qc.q': 'தடைசெய்யப்பட்ட பகுதிக்குள் தொழிலாளர் நுழைந்தால் இயக்குநர் என்ன செய்ய வேண்டும்?',
    'qc.a': 'அதே வேகத்தில் தொடரவும்', 'qc.b': 'ஹார்ன் அடித்து வேலையைத் தொடரவும்', 'qc.c': 'நிறுத்தி சுற்றுப்புறத்தைச் சரிபார்க்கவும்', 'qc.d': 'உடனடியாக பின்னோக்கிச் செல்லவும்',
    'sim.q': 'நீங்கள் என்ன செய்வீர்கள்?', 'sim.scenario': 'ஒரு தொழிலாளர் இயக்கப் பகுதிக்குள் நுழைந்துள்ளார்.',
    'sim.a': 'இயக்கத்தைத் தொடரவும்', 'sim.b': 'வேகத்தைக் குறைக்கவும்', 'sim.c': 'நிறுத்தி சுற்றுப்புறத்தைச் சரிபார்க்கவும்', 'sim.d': 'உடனடியாக பின்னோக்கிச் செல்லவும்',
    'disclaimer': 'உருவகப்படுத்தப்பட்ட சூழ்நிலை — நிஜ உலக விளைவுக்கான உத்தரவாதம் அல்ல.',
  },
  hi: {
    'nav.overview': 'अवलोकन', 'nav.machine': 'लाइव मशीन', 'nav.tasks': 'कार्य', 'nav.safety': 'सुरक्षा केंद्र',
    'nav.twin': 'ऑपरेटर ट्विन', 'nav.training': 'प्रशिक्षण केंद्र', 'nav.sim': '3D सिम्युलेटर', 'nav.replay': 'सुरक्षा रीप्ले',
    'nav.whatif': 'क्या-अगर', 'nav.analytics': 'विश्लेषण', 'op.role': 'ऑपरेटर', 'op.onduty': 'ड्यूटी पर',
    'greet.morning': 'सुप्रभात, ऑपरेटर', 'ov.today': 'आज का संचालन', 'ov.safety': 'सुरक्षा स्थिति',
    'lvl.low': 'कम जोखिम', 'lvl.medium': 'मध्यम जोखिम', 'lvl.high': 'उच्च जोखिम',
    'alert.title': 'संभावित निकटता जोखिम', 'alert.rec': 'गति कम करें और आसपास की जाँच करें।',
    'btn.why': 'कारण देखें', 'btn.take': 'कार्रवाई करें', 'btn.dismiss': 'खारिज करें',
    'sub.3': 'चलने से पहले हमेशा मशीन के आसपास के क्षेत्र की जाँच करें।',
  },
  te: {
    'nav.overview': 'అవలోకనం', 'nav.machine': 'లైవ్ యంత్రం', 'nav.tasks': 'పనులు', 'nav.safety': 'భద్రతా కేంద్రం',
    'nav.twin': 'ఆపరేటర్ ట్విన్', 'nav.training': 'శిక్షణ కేంద్రం', 'nav.sim': '3D సిమ్యులేటర్', 'nav.replay': 'భద్రతా రీప్లే',
    'nav.whatif': 'ఏమైతే', 'nav.analytics': 'విశ్లేషణ', 'op.role': 'ఆపరేటర్', 'op.onduty': 'విధిలో',
    'greet.morning': 'శుభోదయం, ఆపరేటర్', 'ov.today': 'నేటి కార్యకలాపం', 'ov.safety': 'భద్రతా స్థితి',
    'lvl.low': 'తక్కువ ప్రమాదం', 'lvl.medium': 'మధ్యస్థ ప్రమాదం', 'lvl.high': 'అధిక ప్రమాదం',
    'alert.title': 'సంభావ్య సామీప్య ప్రమాదం', 'alert.rec': 'వేగం తగ్గించి పరిసరాలను తనిఖీ చేయండి.',
    'btn.why': 'ఎందుకో చూడండి', 'btn.take': 'చర్య తీసుకోండి', 'btn.dismiss': 'తీసివేయండి',
    'sub.3': 'కదలడానికి ముందు ఎల్లప్పుడూ యంత్రం చుట్టూ ఉన్న ప్రాంతాన్ని తనిఖీ చేయండి.',
  },
};

export const LANGS = [
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'ta', label: 'தமிழ்', short: 'த' },
  { id: 'hi', label: 'हिन्दी', short: 'हि' },
  { id: 'te', label: 'తెలుగు', short: 'తె' },
];

const Ctx = createContext({ lang: 'en', setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }) {
  const [lang, setLang] = useState('en');
  const t = useCallback((k) => dict[lang]?.[k] ?? dict.en[k] ?? k, [lang]);
  React.useEffect(() => { try { document.documentElement.lang = lang; } catch { /* ignore */ } }, [lang]);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
