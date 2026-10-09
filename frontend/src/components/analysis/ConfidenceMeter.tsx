import { useTranslation } from 'react-i18next';
import { confidenceBand, type ConfidenceBand } from './characterModel';

const BAND_KEY: Record<ConfidenceBand, string> = {
  high: 'character.confidenceHigh',
  mid: 'character.confidenceMid',
  low: 'character.confidenceLow',
};

/**
 * 信心度三件套：長條＋「高／中／低 · N%」（＋門檻說明，由呼叫端決定放不放）。
 * Ink 下長條顏色會塌成單色，所以文字檔位與百分比是必要的冗餘編碼，不是重複。
 * 人格分頁與框架對照抽屜共用。
 */
export function ConfidenceMeter({ pct }: Readonly<{ pct: number }>) {
  const { t } = useTranslation('analysis');
  return (
    <div className="ca-conf">
      <div className="ca-conf-track">
        <div className="ca-conf-fill" style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <span className="ca-conf-pct">
        {t(BAND_KEY[confidenceBand(pct)])} · {pct}%
      </span>
    </div>
  );
}
