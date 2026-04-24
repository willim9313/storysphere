import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhTWCommon from './locales/zh-TW/common.json';
import zhTWNav from './locales/zh-TW/nav.json';
import zhTWLibrary from './locales/zh-TW/library.json';
import zhTWUpload from './locales/zh-TW/upload.json';
import zhTWAnalysis from './locales/zh-TW/analysis.json';
import zhTWSettings from './locales/zh-TW/settings.json';
import zhTWChat from './locales/zh-TW/chat.json';
import zhTWGraph from './locales/zh-TW/graph.json';
import zhTWReader from './locales/zh-TW/reader.json';
import zhTWFrameworks from './locales/zh-TW/frameworks.json';

import enCommon from './locales/en/common.json';
import enNav from './locales/en/nav.json';
import enLibrary from './locales/en/library.json';
import enUpload from './locales/en/upload.json';
import enAnalysis from './locales/en/analysis.json';
import enSettings from './locales/en/settings.json';
import enChat from './locales/en/chat.json';
import enGraph from './locales/en/graph.json';
import enReader from './locales/en/reader.json';
import enFrameworks from './locales/en/frameworks.json';

const savedLang = localStorage.getItem('lang') ?? 'zh-TW';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-TW': {
        common: zhTWCommon,
        nav: zhTWNav,
        library: zhTWLibrary,
        upload: zhTWUpload,
        analysis: zhTWAnalysis,
        settings: zhTWSettings,
        chat: zhTWChat,
        graph: zhTWGraph,
        reader: zhTWReader,
        frameworks: zhTWFrameworks,
      },
      en: {
        common: enCommon,
        nav: enNav,
        library: enLibrary,
        upload: enUpload,
        analysis: enAnalysis,
        settings: enSettings,
        chat: enChat,
        graph: enGraph,
        reader: enReader,
        frameworks: enFrameworks,
      },
    },
    lng: savedLang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

i18n.on('languageChanged', (lang) => {
  localStorage.setItem('lang', lang);
});

export default i18n;
