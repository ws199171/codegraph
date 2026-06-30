#!/usr/bin/env node
/**
 * CodeGraph vs 传统搜索 (grep/find) 对比测试脚本 v2
 * 
 * 修复: CodeGraph 在 AOSP federation 模式下需要按 repo 粒度查询，
 * -p 需指向具体的 repo 路径而非工作区根目录。
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ========== 配置 ==========
const CODEGRAPH_BIN = path.resolve(__dirname, '../dist/bin/codegraph.js');
const AOSP_ROOT = '/root/civ13';
const REPEAT = 3;
const OUTPUT_REPORT = path.resolve(__dirname, '../docs/reports/codegraph-benchmark-2026-06-30-force.md');

process.env.CODEGRAPH_NO_DAEMON = '1';

// ========== 四类测试定义 ==========
// 每个查询指定 { symbol, cgRepo (CodeGraph 查询范围 repo), grepDir (grep 搜索范围) }
const CATEGORIES = {
  system_app: {
    name: '系统APP',
    queries: [
      { label: '符号搜索', type: 'query', 
        items: [
          { sym: 'ContactSaveService',     repo: '/root/civ13/packages/apps/Contacts',    gdir: '/root/civ13/packages/apps' },
          { sym: 'InCallPresenter',        repo: '/root/civ13/packages/apps/Dialer',       gdir: '/root/civ13/packages/apps' },
          { sym: 'MmsUtils',               repo: '/root/civ13/packages/apps/Messaging',    gdir: '/root/civ13/packages/apps' },
          { sym: 'BugleNotifications',     repo: '/root/civ13/packages/apps/Messaging',    gdir: '/root/civ13/packages/apps' },
          { sym: 'SettingsActivity',       repo: '/root/civ13/packages/apps/Settings',     gdir: '/root/civ13/packages/apps' },
        ]},
      { label: '调用关系', type: 'callers',
        items: [
          { sym: 'onCreate',               repo: '/root/civ13/packages/apps/Settings',     gdir: '/root/civ13/packages/apps' },
          { sym: 'onResume',               repo: '/root/civ13/packages/apps/Settings',     gdir: '/root/civ13/packages/apps' },
          { sym: 'startActivity',          repo: '/root/civ13/packages/apps/Contacts',     gdir: '/root/civ13/packages/apps' },
          { sym: 'sendMessage',            repo: '/root/civ13/packages/apps/Messaging',    gdir: '/root/civ13/packages/apps' },
          { sym: 'onClick',                repo: '/root/civ13/packages/apps/Settings',     gdir: '/root/civ13/packages/apps' },
        ]},
      { label: '影响分析', type: 'impact',
        items: [
          { sym: 'ContactSaveService',     repo: '/root/civ13/packages/apps/Contacts',    gdir: '/root/civ13/packages/apps' },
          { sym: 'Utils',                  repo: '/root/civ13/packages/apps/Settings',     gdir: '/root/civ13/packages/apps' },
          { sym: 'onCreate',               repo: '/root/civ13/packages/apps/Settings',     gdir: '/root/civ13/packages/apps' },
          { sym: 'startActivity',          repo: '/root/civ13/packages/apps/Contacts',     gdir: '/root/civ13/packages/apps' },
          { sym: 'BugleNotifications',     repo: '/root/civ13/packages/apps/Messaging',    gdir: '/root/civ13/packages/apps' },
        ]},
    ],
  },

  framework: {
    name: 'Framework',
    queries: [
      { label: '符号搜索', type: 'query',
        items: [
          { sym: 'ActivityManagerService',  repo: '/root/civ13/frameworks/base',   gdir: '/root/civ13/frameworks/base' },
          { sym: 'SystemServer',            repo: '/root/civ13/frameworks/base',   gdir: '/root/civ13/frameworks/base' },
          { sym: 'IActivityManager',        repo: '/root/civ13/frameworks/base',   gdir: '/root/civ13/frameworks/base' },
          { sym: 'AppOpsManager',           repo: '/root/civ13/frameworks/base',   gdir: '/root/civ13/frameworks/base' },
          { sym: 'StorageManagerService',   repo: '/root/civ13/frameworks/base',   gdir: '/root/civ13/frameworks/base' },
        ]},
      { label: '调用关系', type: 'callers',
        items: [
          { sym: 'registerReceiver',        repo: '/root/civ13/frameworks/base',   gdir: '/root/civ13/frameworks/base' },
          { sym: 'sendBroadcast',           repo: '/root/civ13/frameworks/base',   gdir: '/root/civ13/frameworks/base' },
          { sym: 'startService',            repo: '/root/civ13/frameworks/base',   gdir: '/root/civ13/frameworks/base' },
          { sym: 'bindService',             repo: '/root/civ13/frameworks/base',   gdir: '/root/civ13/frameworks/base' },
          { sym: 'onTransact',              repo: '/root/civ13/frameworks/base',   gdir: '/root/civ13/frameworks/base' },
        ]},
      { label: '影响分析', type: 'impact',
        items: [
          { sym: 'ActivityManagerService',  repo: '/root/civ13/frameworks/base',   gdir: '/root/civ13/frameworks/base' },
          { sym: 'IActivityManager',        repo: '/root/civ13/frameworks/base',   gdir: '/root/civ13/frameworks/base' },
          { sym: 'sendBroadcast',           repo: '/root/civ13/frameworks/base',   gdir: '/root/civ13/frameworks/base' },
          { sym: 'startService',            repo: '/root/civ13/frameworks/base',   gdir: '/root/civ13/frameworks/base' },
          { sym: 'ActivityThread',          repo: '/root/civ13/frameworks/base',   gdir: '/root/civ13/frameworks/base' },
        ]},
    ],
  },

  kernel: {
    name: 'Linux内核',
    queries: [
      { label: '符号搜索', type: 'query',
        items: [
          { sym: 'blk_mq_run_hw_queue',     repo: '/root/civ13/kernel/android14-6.1-lts',  gdir: '/root/civ13/kernel/android14-6.1-lts' },
          { sym: 'schedule',                repo: '/root/civ13/kernel/android14-6.1-lts',  gdir: '/root/civ13/kernel/android14-6.1-lts' },
          { sym: 'do_fork',                 repo: '/root/civ13/kernel/android14-6.1-lts',  gdir: '/root/civ13/kernel/android14-6.1-lts' },
          { sym: 'ext4_file_write_iter',    repo: '/root/civ13/kernel/android14-6.1-lts',  gdir: '/root/civ13/kernel/android14-6.1-lts' },
          { sym: 'blk_queue_bio',           repo: '/root/civ13/kernel/android14-6.1-lts',  gdir: '/root/civ13/kernel/android14-6.1-lts' },
        ]},
      { label: '调用关系', type: 'callers',
        items: [
          { sym: 'kmalloc',                 repo: '/root/civ13/kernel/android14-6.1-lts',  gdir: '/root/civ13/kernel/android14-6.1-lts' },
          { sym: 'printk',                  repo: '/root/civ13/kernel/android14-6.1-lts',  gdir: '/root/civ13/kernel/android14-6.1-lts' },
          { sym: 'spin_lock',               repo: '/root/civ13/kernel/android14-6.1-lts',  gdir: '/root/civ13/kernel/android14-6.1-lts' },
          { sym: 'kfree',                   repo: '/root/civ13/kernel/android14-6.1-lts',  gdir: '/root/civ13/kernel/android14-6.1-lts' },
          { sym: 'mutex_lock',              repo: '/root/civ13/kernel/android14-6.1-lts',  gdir: '/root/civ13/kernel/android14-6.1-lts' },
        ]},
      { label: '影响分析', type: 'impact',
        items: [
          { sym: 'blk_mq_run_hw_queue',     repo: '/root/civ13/kernel/android14-6.1-lts',  gdir: '/root/civ13/kernel/android14-6.1-lts' },
          { sym: 'schedule',                repo: '/root/civ13/kernel/android14-6.1-lts',  gdir: '/root/civ13/kernel/android14-6.1-lts' },
          { sym: 'kmalloc',                 repo: '/root/civ13/kernel/android14-6.1-lts',  gdir: '/root/civ13/kernel/android14-6.1-lts' },
          { sym: 'spin_lock',               repo: '/root/civ13/kernel/android14-6.1-lts',  gdir: '/root/civ13/kernel/android14-6.1-lts' },
          { sym: 'do_fork',                 repo: '/root/civ13/kernel/android14-6.1-lts',  gdir: '/root/civ13/kernel/android14-6.1-lts' },
        ]},
    ],
  },

  native: {
    name: 'Native代码',
    queries: [
      { label: '符号搜索', type: 'query',
        items: [
          { sym: 'OpenArchive',             repo: '/root/civ13/system/libziparchive',     gdir: '/root/civ13' },
          { sym: 'writeInt32',              repo: '/root/civ13/system/libhwbinder',       gdir: '/root/civ13' },
          { sym: 'ril_service',             repo: '/root/civ13/hardware/ril/libril',      gdir: '/root/civ13' },
          { sym: 'gsid',                    repo: '/root/civ13/system/gsid',              gdir: '/root/civ13' },
          { sym: 'SysfsCollector',          repo: '/root/civ13/hardware/google/pixel',    gdir: '/root/civ13' },
        ]},
      { label: '调用关系', type: 'callers',
        items: [
          { sym: 'malloc',                  repo: '/root/civ13/external/libcxx',          gdir: '/root/civ13/external' },
          { sym: 'free',                    repo: '/root/civ13/external/libcxx',          gdir: '/root/civ13/external' },
          { sym: 'pthread_create',          repo: '/root/civ13/bionic',                   gdir: '/root/civ13/bionic' },
          { sym: 'memcpy',                  repo: '/root/civ13/bionic',                   gdir: '/root/civ13/bionic' },
          { sym: 'open',                    repo: '/root/civ13/bionic',                   gdir: '/root/civ13/bionic' },
        ]},
      { label: '影响分析', type: 'impact',
        items: [
          { sym: 'OpenArchive',             repo: '/root/civ13/system/libziparchive',     gdir: '/root/civ13' },
          { sym: 'writeInt32',              repo: '/root/civ13/system/libhwbinder',       gdir: '/root/civ13' },
          { sym: 'ril_service',             repo: '/root/civ13/hardware/ril/libril',      gdir: '/root/civ13' },
          { sym: 'malloc',                  repo: '/root/civ13/external/libcxx',          gdir: '/root/civ13/external' },
          { sym: 'pthread_create',          repo: '/root/civ13/bionic',                   gdir: '/root/civ13/bionic' },
        ]},
    ],
  },
};

// ========== 工具函数 ==========
function timedExec(command, timeoutMs = 30000) {
  const start = process.hrtime.bigint();
  let stdout = '', stderr = '';
  try {
    stdout = execSync(command, { timeout: timeoutMs, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    stdout = e.stdout?.toString() || '';
    stderr = e.stderr?.toString() || '';
  }
  const end = process.hrtime.bigint();
  return { stdout: stdout.trim(), stderr: stderr.trim(), timeMs: Number(end - start) / 1_000_000 };
}

function countCodegraphResults(stdout) {
  if (!stdout) return 0;
  try {
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed.results && Array.isArray(parsed.results)) return parsed.results.length;
    if (parsed.count !== undefined) return parsed.count;
    return stdout.split('\n').filter(l => l.trim()).length;
  } catch {
    return stdout.split('\n').filter(l => l.trim()).length;
  }
}

function countGrepResults(stdout) {
  return stdout ? stdout.split('\n').filter(l => l.trim()).length : 0;
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

// ========== CodeGraph 查询命令生成 ==========
function buildCgCmd(item, queryType) {
  const sym = item.sym;
  switch (queryType) {
    case 'query':  return `node "${CODEGRAPH_BIN}" query ${sym} -l 30 --json -p "${item.repo}"`;
    case 'callers': return `node "${CODEGRAPH_BIN}" callers ${sym} -l 30 -p "${item.repo}"`;
    case 'impact':  return `node "${CODEGRAPH_BIN}" impact ${sym} --depth 2 -p "${item.repo}"`;
    default:        return `node "${CODEGRAPH_BIN}" query ${sym} -l 30 --json -p "${item.repo}"`;
  }
}

// ========== Grep 查询命令 ==========
function buildGrepCmd(item, queryType) {
  const sym = item.sym;
  const gdir = item.gdir;
  switch (queryType) {
    case 'query':
      return `grep -rn "${sym}" "${gdir}" -l 2>/dev/null | head -20`;
    case 'callers':
      return `grep -rn "\\.${sym}\\s*\\(" "${gdir}" 2>/dev/null | head -20`;
    case 'impact':
      return `grep -rn "${sym}" "${gdir}" 2>/dev/null | wc -l`;
    default:
      return `grep -rn "${sym}" "${gdir}" -l 2>/dev/null | head -20`;
  }
}

// ========== 主流程 ==========
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  CodeGraph vs 传统搜索 对比基准测试 v2           ║');
  console.log('║  (per-repo query, 1,206 repos indexed)           ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const info = {
    date: new Date().toISOString().split('T')[0],
    codegraphVer: execSync(`node "${CODEGRAPH_BIN}" version`, { encoding: 'utf-8' }).trim(),
    hostname: execSync('hostname', { encoding: 'utf-8' }).trim(),
    cpuCores: execSync('nproc', { encoding: 'utf-8' }).trim(),
    memTotal: execSync('free -h | grep Mem | awk \'{print $2}\'', { encoding: 'utf-8' }).trim(),
  };

  console.log(`📋 机器: ${info.hostname} | CPU: ${info.cpuCores}核 | 内存: ${info.memTotal}`);
  console.log(`📋 CodeGraph: v${info.codegraphVer} | 日期: ${info.date}`);
  console.log(`📋 索引库: 1,206 repos (federation per-repo)`);
  console.log(`📋 重复次数: ${REPEAT} | 超时: 30s\n`);

  const allResults = {};

  for (const [catKey, cat] of Object.entries(CATEGORIES)) {
    console.log(`\n${'━'.repeat(55)}`);
    console.log(`  ${cat.name}`);
    console.log(`${'━'.repeat(55)}`);
    allResults[catKey] = { name: cat.name, queryResults: [] };

    for (const queryDef of cat.queries) {
      console.log(`\n  📌 ${queryDef.label}`);
      
      for (const item of queryDef.items) {
        const cgTimes = [];
        const grepTimes = [];
        let cgResultCount = 0;
        let grepResultCount = 0;
        let cgStatus = 'OK';
        let grepStatus = 'OK';

        // ---- CodeGraph ----
        const cgCmd = buildCgCmd(item, queryDef.type);
        for (let r = 0; r < REPEAT; r++) {
          const result = timedExec(cgCmd);
          cgTimes.push(result.timeMs);
          if (r === 0) cgResultCount = countCodegraphResults(result.stdout);
          if (result.stderr && result.stderr.includes('Error')) cgStatus = 'ERR';
        }

        // ---- Grep ----
        const grepCmd = buildGrepCmd(item, queryDef.type);
        for (let r = 0; r < REPEAT; r++) {
          const result = timedExec(grepCmd);
          grepTimes.push(Math.min(result.timeMs, 30000));
          if (r === 0) grepResultCount = countGrepResults(result.stdout);
        }

        const cgMed = median(cgTimes);
        const grepMed = median(grepTimes);
        const speedup = grepMed > 0 && cgMed > 0 ? (grepMed / cgMed).toFixed(1) : '-';

        const entry = {
          category: cat.name,
          queryType: queryDef.label,
          symbol: item.sym,
          repo: path.basename(item.repo),
          cgTimeMs: cgMed.toFixed(0),
          grepTimeMs: grepMed.toFixed(0),
          speedup,
          cgResults: cgResultCount,
          grepResults: grepResultCount,
          cgStatus,
          grepStatus,
        };
        allResults[catKey].queryResults.push(entry);

        const statusIcon = cgMed < grepMed ? '✅ CG更快' : cgMed > grepMed ? '🐢 grep更快' : '⚡ 持平';
        const cgR = cgResultCount > 0 ? `${cgResultCount}` : '0⚠️';
        console.log(`     ${item.sym.padEnd(24)} | CG ${String(cgMed.toFixed(0)).padStart(6)}ms / grep ${String(grepMed.toFixed(0)).padStart(6)}ms | ${cgR} vs ${grepResultCount} results | ${statusIcon}`);
      }
    }
  }

  // ========== 生成报告 ==========
  console.log(`\n\n📝 生成报告 → ${OUTPUT_REPORT}`);
  generateReport(allResults, info);
  console.log('✅ 测试完成！');
}

function generateReport(allResults, info) {
  const lines = [];
  const L = (s) => lines.push(s);
  const BAR = (len, cg, grep) => {
    const max = Math.max(cg, grep, 1);
    const cgBar = '█'.repeat(Math.min(Math.round(cg / max * 40), 40));
    const grepBar = '░'.repeat(Math.min(Math.round(grep / max * 40), 40));
    return `CG   │${cgBar.padEnd(40)}│ ${cg.toFixed(0)}ms\ngrep │${grepBar.padEnd(40)}│ ${grep.toFixed(0)}ms`;
  };

  L(`# CodeGraph vs 传统文件搜索 对比测试报告`);
  L('');
  L(`> 生成日期: ${info.date} | CodeGraph v${info.codegraphVer}`);
  L('');
  L('## 1. 测试环境');
  L('');
  L('| 项目 | 值 |');
  L('|------|-----|');
  L(`| 机器 | ${info.hostname} |`);
  L(`| CPU | ${info.cpuCores} 核 |`);
  L(`| 内存 | ${info.memTotal} |`);
  L(`| AOSP 版本 | civ13 (Android 13) |`);
  L(`| CodeGraph 版本 | ${info.codegraphVer} |`);
  L(`| 索引模式 | Federation per-repo (1,206 repos) |`);
  L(`| 传统工具 | GNU grep 3.x |`);
  L(`| 测试日期 | ${info.date} |`);
  L(`| 每查询重复 | ${REPEAT} 次取中位数 |`);
  L('');

  // 汇总
  let totalCg = 0, totalGrep = 0, cgWins = 0, grepWins = 0, ties = 0;
  const allItems = [];
  for (const cat of Object.values(allResults)) {
    for (const r of cat.queryResults) {
      allItems.push(r);
      totalCg += parseFloat(r.cgTimeMs);
      totalGrep += parseFloat(r.grepTimeMs);
      if (parseFloat(r.cgTimeMs) < parseFloat(r.grepTimeMs)) cgWins++;
      else if (parseFloat(r.cgTimeMs) > parseFloat(r.grepTimeMs)) grepWins++;
      else ties++;
    }
  }

  L('## 2. 总体统计');
  L('');
  L('| 指标 | 值 |');
  L('|------|-----|');
  L(`| 总查询数 | ${allItems.length} |`);
  L(`| CodeGraph 更快 | ${cgWins} (${(cgWins/allItems.length*100).toFixed(1)}%) |`);
  L(`| grep 更快 | ${grepWins} (${(grepWins/allItems.length*100).toFixed(1)}%) |`);
  L(`| 持平 | ${ties} |`);
  L(`| CG 总耗时 | ${totalCg.toFixed(0)}ms |`);
  L(`| grep 总耗时 | ${totalGrep.toFixed(0)}ms |`);
  L(`| 整体加速比 | ${(totalGrep/totalCg).toFixed(1)}x |`);
  L('');

  // 按类别
  L('## 3. 各类别平均耗时对比');
  L('');
  L('```');
  for (const [catKey, cat] of Object.entries(allResults)) {
    const avgCg = avg(cat.queryResults.map(r => parseFloat(r.cgTimeMs)));
    const avgGrep = avg(cat.queryResults.map(r => parseFloat(r.grepTimeMs)));
    L(`  ${cat.name.padEnd(14)} ${BAR(40, avgCg, avgGrep)}`);
    L('');
  }
  L('```');
  L('');

  // 按类别详细表格
  for (const [catKey, cat] of Object.entries(allResults)) {
    const idx = Object.keys(allResults).indexOf(catKey) + 1;
    L(`## 4.${idx} ${cat.name}`);
    L('');
    
    for (const type of ['符号搜索', '调用关系', '影响分析']) {
      const items = cat.queryResults.filter(r => r.queryType === type);
      if (!items.length) continue;
      
      const avgCg = avg(items.map(r => parseFloat(r.cgTimeMs)));
      const avgGrep = avg(items.map(r => parseFloat(r.grepTimeMs)));
      
      L(`### ${type} (平均 CG=${avgCg.toFixed(0)}ms, grep=${avgGrep.toFixed(0)}ms, 加速 ${(avgGrep/avgCg).toFixed(1)}x)`);
      L('');
      L('| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |');
      L('|------|------|--------|----------|--------|----------|--------|');
      for (const r of items) {
        L(`| ${r.symbol} | ${r.repo} | ${r.cgTimeMs} | ${r.grepTimeMs} | ${r.cgResults} | ${r.grepResults} | ${r.speedup}x |`);
      }
      L('');
    }
  }

  // 综合评分
  L('## 5. 综合评分');
  L('');
  L('### 搜索精度');
  L('');
  L('| 维度 | CodeGraph | grep | 说明 |');
  L('|------|-----------|------|------|');
  L('| 符号精确匹配 | ⭐⭐⭐⭐⭐ | ⭐⭐ | CG AST 级语义匹配，grep 纯文本含大量误报 |');
  L('| 调用关系发现 | ⭐⭐⭐⭐⭐ | ⭐⭐ | CG 基于调用图精确追溯，grep 只能文本匹配函数名 |');
  L('| 影响范围分析 | ⭐⭐⭐⭐ | ⭐ | CG 深度影响分析，grep 只能统计引用行数 |');
  L('| 跨文件上下文 | ⭐⭐⭐⭐⭐ | ⭐ | CG 返回完整符号+调用链，grep 仅匹配行 |');
  L('');
  L('### 搜索速度');
  L('');
  L('| 维度 | CodeGraph | grep | 说明 |');
  L('|------|-----------|------|------|');
  L('| 符号查询 (索引) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | CG 预热后毫秒级，grep 需遍历文件 |');
  L('| 大作用域搜索 | ⭐⭐⭐⭐⭐ | ⭐⭐ | CG 跨 repo 秒级，grep 目录越大越慢 |');
  L('| 调用链追踪 | ⭐⭐⭐⭐ | ⭐ | CG 独有能力，grep 无法实现 |');
  L('| 无索引场景 | ⭐ | ⭐⭐⭐⭐ | grep 即开即用，CG 需预先索引 |');
  L('');
  L('### 适用场景');
  L('');
  L('| 场景 | 推荐工具 | 理由 |');
  L('|------|----------|------|');
  L('| 查找类/函数定义 | CodeGraph | 精确符号匹配 |');
  L('| 追踪谁调用了某方法 | CodeGraph | 调用图分析 |');
  L('| 评估代码改动影响范围 | CodeGraph | 影响分析 |');
  L('| 查找字符串/注释 | grep | 纯文本更直接 |');
  L('| 简单文件名查找 | find | 零开销 |');
  L('| 正则表达式批处理 | grep/sed | 灵活强大 |');
  L('');
  
  L('## 6. 结论');
  L('');
  L(`本次测试覆盖 4 个类别共 ${allItems.length} 个查询，CodeGraph 在 ${cgWins}/${allItems.length} (${(cgWins/allItems.length*100).toFixed(0)}%) 的查询中更快，整体加速 ${(totalGrep/totalCg).toFixed(1)}x。`);
  L('');
  L(`> 💡 **建议**：符号定位、调用链追踪、影响分析场景优先使用 CodeGraph；纯文本/正则搜索场景 grep 仍然是最直接高效的工具。两者互补。`);
  L('');

  fs.writeFileSync(OUTPUT_REPORT, lines.join('\n'), 'utf-8');
}

main().catch(err => { console.error('异常:', err); process.exit(1); });
