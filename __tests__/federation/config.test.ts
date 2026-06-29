import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadWorkspaceConfig,
  loadMasterGraphConfig,
  clearProjectConfigCache,
} from '../../src/project-config';

const TMP_DIR = path.join(os.tmpdir(), 'codegraph-federation-config-test');

describe('federation config loading', () => {
  beforeEach(() => {
    if (fs.existsSync(TMP_DIR)) {
      fs.rmSync(TMP_DIR, { recursive: true });
    }
    fs.mkdirSync(TMP_DIR, { recursive: true });
    clearProjectConfigCache();
  });

  afterEach(() => {
    clearProjectConfigCache();
    if (fs.existsSync(TMP_DIR)) {
      fs.rmSync(TMP_DIR, { recursive: true });
    }
  });

  describe('loadWorkspaceConfig', () => {
    it('returns workspace config when present in codegraph.json', () => {
      fs.writeFileSync(
        path.join(TMP_DIR, 'codegraph.json'),
        JSON.stringify({ workspace: { type: 'aosp', root: '/aosp/root' } }),
      );
      const config = loadWorkspaceConfig(TMP_DIR);
      expect(config).toEqual({ type: 'aosp', root: '/aosp/root' });
    });

    it('returns null when no workspace config present', () => {
      fs.writeFileSync(
        path.join(TMP_DIR, 'codegraph.json'),
        JSON.stringify({ extensions: { '.foo': 'python' } }),
      );
      const config = loadWorkspaceConfig(TMP_DIR);
      expect(config).toBeNull();
    });

    it('returns null when codegraph.json does not exist', () => {
      const config = loadWorkspaceConfig(TMP_DIR);
      expect(config).toBeNull();
    });

    it('returns null when workspace field is incomplete', () => {
      fs.writeFileSync(
        path.join(TMP_DIR, 'codegraph.json'),
        JSON.stringify({ workspace: { type: 'aosp' } }),
      );
      const config = loadWorkspaceConfig(TMP_DIR);
      expect(config).toBeNull();
    });
  });

  describe('loadMasterGraphConfig', () => {
    it('returns masterGraph config when present', () => {
      fs.writeFileSync(
        path.join(TMP_DIR, 'codegraph.json'),
        JSON.stringify({ masterGraph: { store: '.custom-master/' } }),
      );
      const config = loadMasterGraphConfig(TMP_DIR);
      expect(config.store).toBe('.custom-master/');
    });

    it('returns default store when masterGraph not present', () => {
      fs.writeFileSync(
        path.join(TMP_DIR, 'codegraph.json'),
        JSON.stringify({ extensions: {} }),
      );
      const config = loadMasterGraphConfig(TMP_DIR);
      expect(config.store).toBe('.codegraph-master/');
    });

    it('returns default store when codegraph.json does not exist', () => {
      const config = loadMasterGraphConfig(TMP_DIR);
      expect(config.store).toBe('.codegraph-master/');
    });
  });
});
