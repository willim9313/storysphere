import { useTranslation } from 'react-i18next';

type ReviewStatus = 'pending' | 'approved' | 'modified' | 'rejected';

export function TensionStatusBadge({ status }: { status: ReviewStatus }) {
  const { t } = useTranslation('analysis');
  return (
    <span className="tn-status-badge" data-s={status}>
      {t(`tension.status.${status}`)}
    </span>
  );
}
