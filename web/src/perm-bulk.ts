import type { FeatureDef, PermAction } from './types';

/**
 * Mã quyền mà một ô tích hàng loạt (cả cột của module, cả module, cả phân hệ) bật / tắt.
 * Ô phạm vi (Tất cả khách hàng / dự án) là quyền riêng nên không nằm trong ô tích hàng loạt.
 */
export function bulkPerms(features: FeatureDef[], action?: PermAction): string[] {
  return features.filter((f) => !f.scope && (!action || f.actions.includes(action)))
    .flatMap((f) => (action ? [action] : f.actions).map((a) => `${f.key}.${a}`));
}
