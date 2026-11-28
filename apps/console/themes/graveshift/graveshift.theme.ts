// The graveshift theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in graveshift.settings.json and the generated graveshift.settings.ts;
// change them with `astryx experimental theme editor set graveshift ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {graveshiftSettings} from './graveshift.settings';

export const graveshiftTheme = defineTheme({
  extends: graveshiftSettings,
  name: 'graveshift',
});
