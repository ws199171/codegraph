import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  resolveWorkspaceRoot,
  writePathTxtCache,
} from '../../src/federation/workspace-resolver';
import { clearProjectConfigCache } from '../../src/project-config';

const TMP_ROOT = path.join(os.tmpdir(), 'codegraph-ws-resolver-test');

function makeMasterDir(root: string): void {
  const masterDir = path.join(root, '.codegraph-master');
  fs.mkdirSync(masterDir, { recursive: true });
  fs.writeFileSync(path.join(masterDir, 'codegraph.db'), '');
}

function makeWorkspaceConfig(root: string, type = 'aosp', wsRoot = '/aosp'): void {
  fs.writeFileSync(
    path.join(root, 'codegraph.json'),
    JSON.stringify({ workspace: { type, root: wsRoot } }),
  );
}

describe('workspace-resolver', () => {
  beforeEach(() => {
    if (fs.existsSync(TMP_ROOT)) {
      fs.rmSync(TMP_ROOT, { recursive: true });
    }
    fs.mkdirSync(TMP_ROOT, { recursive: true });
    clearProjectConfigCache();
    delete process.env.CODEGRAPH_MASTER_HOME;
  });

  afterEach(() => {
    clearProjectConfigCache();
    delete process.env.CODEGRAPH_MASTER_HOME;
    if (fs.existsSync(TMP_ROOT)) {
      fs.rmSync(TMP_ROOT, { recursive: true });
    }
  });

  describe('resolveWorkspaceRoot', () => {
    it('returns explicit path when it has master dir', () => {
      const wsRoot = path.join(TMP_ROOT, 'explicit-ws');
      fs.mkdirSync(wsRoot, { recursive: true });
      makeMasterDir(wsRoot);

      const result = resolveWorkspaceRoot(TMP_ROOT, wsRoot);
      expect(result).toBe(wsRoot);
    });

    it('returns null for explicit path without master dir', () => {
      const noMaster = path.join(TMP_ROOT, 'no-master');
      fs.mkdirSync(noMaster, { recursive: true });

      const result = resolveWorkspaceRoot(TMP_ROOT, noMaster);
      expect(result).toBeNull();
    });

    it('uses CODEGRAPH_MASTER_HOME env var when it has master dir', () => {
      const envRoot = path.join(TMP_ROOT, 'env-ws');
      fs.mkdirSync(envRoot, { recursive: true });
      makeMasterDir(envRoot);
      process.env.CODEGRAPH_MASTER_HOME = envRoot;

      const result = resolveWorkspaceRoot(TMP_ROOT);
      expect(result).toBe(envRoot);
    });

    it('discovers workspace via walk-up when subdir has master dir', () => {
      const wsRoot = path.join(TMP_ROOT, 'walkup-ws');
      const subDir = path.join(wsRoot, 'frameworks', 'base', 'core');
      fs.mkdirSync(subDir, { recursive: true });
      makeMasterDir(wsRoot);

      const result = resolveWorkspaceRoot(subDir);
      expect(result).toBe(wsRoot);
    });

    it('returns null when no workspace found in walk-up', () => {
      const plain = path.join(TMP_ROOT, 'plain-dir', 'sub');
      fs.mkdirSync(plain, { recursive: true });

      const result = resolveWorkspaceRoot(plain);
      expect(result).toBeNull();
    });
  });

  describe('writePathTxtCache', () => {
    it('writes path.txt under .codegraph-master/', () => {
      const wsRoot = path.join(TMP_ROOT, 'cache-ws');
      fs.mkdirSync(wsRoot, { recursive: true });
      makeMasterDir(wsRoot);

      writePathTxtCache(wsRoot);

      const cacheFile = path.join(wsRoot, '.codegraph-master', 'path.txt');
      expect(fs.existsSync(cacheFile)).toBe(true);
      const content = fs.readFileSync(cacheFile, 'utf-8').trim();
      expect(content).toBe(wsRoot);
    });

    it('creates .codegraph-master dir if it does not exist', () => {
      const wsRoot = path.join(TMP_ROOT, 'cache-nodir');
      fs.mkdirSync(wsRoot, { recursive: true });

      writePathTxtCache(wsRoot);

      const cacheFile = path.join(wsRoot, '.codegraph-master', 'path.txt');
      expect(fs.existsSync(cacheFile)).toBe(true);
    });
  });
});
