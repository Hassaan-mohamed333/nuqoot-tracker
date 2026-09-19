/** يسجّل محلِّل الأسماء المستعارة قبل تحميل أي اختبار. */
import { register } from 'node:module';

register('./alias-hooks.mjs', import.meta.url);
