import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { discoverRepos } from '../../src/federation/workspace-scanner';

const FIXTURES = path.join(__dirname, 'fixtures');
const WORKSPACE = path.join(FIXTURES, 'test-workspace');
const BFS_WORKSPACE = path.join(FIXTURES, 'bfs-workspace');

describe('workspace-scanner', () => {
  describe('discoverRepos with manifest', () => {
    it('discovers repos from .repo/manifest.xml', () => {
      const repos = discoverRepos(WORKSPACE);
      const paths = repos.map((r) => r.path);
      expect(paths).toContain('frameworks/base');
      expect(paths).toContain('frameworks/native');
    });

    it('sets status to pending for all discovered repos', () => {
      const repos = discoverRepos(WORKSPACE);
      for (const r of repos) {
        expect(r.status).toBe('pending');
      }
    });

    it('repos have absolute paths', () => {
      const repos = discoverRepos(WORKSPACE);
      for (const r of repos) {
        expect(path.isAbsolute(r.absPath)).toBe(true);
      }
    });

    it('absPath points to the actual repo directory', () => {
      const repos = discoverRepos(WORKSPACE);
      for (const r of repos) {
        expect(r.absPath).toBe(path.join(WORKSPACE, r.path));
      }
    });
  });

  describe('discoverRepos with BFS fallback', () => {
    it('discovers repos via .git BFS when no manifest', () => {
      const repos = discoverRepos(BFS_WORKSPACE);
      const paths = repos.map((r) => r.path);
      // nested/repo/.git should be found
      expect(paths).toContain(path.join('nested', 'repo'));
    });

    it('sets status to pending for BFS-discovered repos', () => {
      const repos = discoverRepos(BFS_WORKSPACE);
      for (const r of repos) {
        expect(r.status).toBe('pending');
      }
    });
  });

  describe('discoverRepos error handling', () => {
    it('throws for non-existent root', () => {
      expect(() => discoverRepos('/non/existent/path/12345')).toThrow();
    });
  });
});
