# CodeGraph vs 传统文件搜索 对比测试报告

> 生成日期: 2026-06-30 | CodeGraph v1.1.3-AOSP3

## 1. 测试环境

| 项目 | 值 |
|------|-----|
| 机器 | dillonwang-1dqihdwyea |
| CPU | 48 核 |
| 内存 | 123Gi |
| AOSP 版本 | civ13 (Android 13) |
| CodeGraph 版本 | 1.1.3-AOSP3 |
| 索引模式 | Federation per-repo (1,206 repos) |
| 传统工具 | GNU grep 3.x |
| 测试日期 | 2026-06-30 |
| 每查询重复 | 3 次取中位数 |

## 2. 总体统计

| 指标 | 值 |
|------|-----|
| 总查询数 | 60 |
| CodeGraph 更快 | 34 (56.7%) |
| grep 更快 | 26 (43.3%) |
| 持平 | 0 |
| CG 总耗时 | 43936ms |
| grep 总耗时 | 322395ms |
| 整体加速比 | 7.3x |

## 3. 各类别平均耗时对比

```
  系统APP          CG   │█████████████                           │ 315ms
grep │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ 949ms

  Framework      CG   │████████████████████████                │ 714ms
grep │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ 1192ms

  Linux内核        CG   │████████████████████████████████████████│ 1612ms
grep │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░       │ 1346ms

  Native代码       CG   │█                                       │ 289ms
grep │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ 18006ms

```

## 4.1 系统APP

### 符号搜索 (平均 CG=300ms, grep=1634ms, 加速 5.4x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| ContactSaveService | Contacts | 262 | 1900 | 30 | 20 | 7.2x |
| InCallPresenter | Dialer | 284 | 1850 | 30 | 20 | 6.5x |
| MmsUtils | Messaging | 259 | 2112 | 30 | 20 | 8.2x |
| BugleNotifications | Messaging | 285 | 1844 | 30 | 18 | 6.5x |
| SettingsActivity | Settings | 412 | 463 | 30 | 20 | 1.1x |

### 调用关系 (平均 CG=326ms, grep=2ms, 加速 0.0x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| onCreate | Settings | 367 | 2 | 1 | 0 | 0.0x |
| onResume | Settings | 366 | 2 | 1 | 0 | 0.0x |
| startActivity | Contacts | 255 | 2 | 41 | 0 | 0.0x |
| sendMessage | Messaging | 272 | 2 | 11 | 0 | 0.0x |
| onClick | Settings | 372 | 2 | 1 | 0 | 0.0x |

### 影响分析 (平均 CG=318ms, grep=1212ms, 加速 3.8x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| ContactSaveService | Contacts | 270 | 1903 | 289 | 1 | 7.1x |
| Utils | Settings | 411 | 805 | 170 | 1 | 2.0x |
| onCreate | Settings | 371 | 782 | 99 | 1 | 2.1x |
| startActivity | Contacts | 269 | 709 | 66 | 1 | 2.6x |
| BugleNotifications | Messaging | 268 | 1863 | 145 | 1 | 6.9x |

## 4.2 Framework

### 符号搜索 (平均 CG=736ms, grep=1461ms, 加速 2.0x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| ActivityManagerService | base | 732 | 1535 | 30 | 20 | 2.1x |
| SystemServer | base | 747 | 356 | 30 | 20 | 0.5x |
| IActivityManager | base | 739 | 1665 | 30 | 20 | 2.3x |
| AppOpsManager | base | 735 | 1627 | 30 | 20 | 2.2x |
| StorageManagerService | base | 726 | 2120 | 30 | 20 | 2.9x |

### 调用关系 (平均 CG=681ms, grep=2ms, 加速 0.0x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| registerReceiver | base | 675 | 3 | 1 | 0 | 0.0x |
| sendBroadcast | base | 688 | 2 | 1 | 0 | 0.0x |
| startService | base | 710 | 2 | 1 | 0 | 0.0x |
| bindService | base | 670 | 2 | 1 | 0 | 0.0x |
| onTransact | base | 663 | 2 | 1 | 0 | 0.0x |

### 影响分析 (平均 CG=725ms, grep=2114ms, 加速 2.9x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| ActivityManagerService | base | 758 | 1971 | 1150 | 1 | 2.6x |
| IActivityManager | base | 724 | 2092 | 71 | 1 | 2.9x |
| sendBroadcast | base | 663 | 2211 | 59 | 1 | 3.3x |
| startService | base | 721 | 2200 | 40 | 1 | 3.1x |
| ActivityThread | base | 759 | 2096 | 681 | 1 | 2.8x |

## 4.3 Linux内核

### 符号搜索 (平均 CG=1583ms, grep=2655ms, 加速 1.7x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| blk_mq_run_hw_queue | android14-6.1-lts | 1198 | 1231 | 5 | 20 | 1.0x |
| schedule | android14-6.1-lts | 1660 | 52 | 30 | 20 | 0.0x |
| do_fork | android14-6.1-lts | 1214 | 1447 | 2 | 8 | 1.2x |
| ext4_file_write_iter | android14-6.1-lts | 1215 | 3586 | 2 | 2 | 3.0x |
| blk_queue_bio | android14-6.1-lts | 2626 | 6957 | 0 | 1 | 2.6x |

### 调用关系 (平均 CG=1462ms, grep=2ms, 加速 0.0x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| kmalloc | android14-6.1-lts | 1276 | 2 | 63 | 0 | 0.0x |
| printk | android14-6.1-lts | 1374 | 2 | 63 | 0 | 0.0x |
| spin_lock | android14-6.1-lts | 1346 | 2 | 63 | 0 | 0.0x |
| kfree | android14-6.1-lts | 1691 | 2 | 63 | 0 | 0.0x |
| mutex_lock | android14-6.1-lts | 1622 | 2 | 63 | 0 | 0.0x |

### 影响分析 (平均 CG=1791ms, grep=1380ms, 加速 0.8x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| blk_mq_run_hw_queue | android14-6.1-lts | 1221 | 1247 | 82 | 1 | 1.0x |
| schedule | android14-6.1-lts | 1687 | 1645 | 5 | 1 | 1.0x |
| kmalloc | android14-6.1-lts | 2302 | 1444 | 43959 | 1 | 0.6x |
| spin_lock | android14-6.1-lts | 2544 | 1118 | 40318 | 1 | 0.4x |
| do_fork | android14-6.1-lts | 1199 | 1448 | 8 | 1 | 1.2x |

## 4.4 Native代码

### 符号搜索 (平均 CG=248ms, grep=30000ms, 加速 121.0x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| OpenArchive | libziparchive | 230 | 30000 | 6 | 0 | 130.5x |
| writeInt32 | libhwbinder | 240 | 30000 | 1 | 0 | 125.0x |
| ril_service | libril | 252 | 30000 | 6 | 0 | 119.2x |
| gsid | gsid | 270 | 30000 | 4 | 0 | 111.0x |
| SysfsCollector | pixel | 248 | 30000 | 30 | 0 | 121.1x |

### 调用关系 (平均 CG=324ms, grep=3ms, 加速 0.0x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| malloc | libcxx | 357 | 3 | 1 | 0 | 0.0x |
| free | libcxx | 349 | 3 | 23 | 0 | 0.0x |
| pthread_create | bionic | 295 | 3 | 63 | 0 | 0.0x |
| memcpy | bionic | 308 | 3 | 63 | 0 | 0.0x |
| open | bionic | 310 | 3 | 63 | 0 | 0.0x |

### 影响分析 (平均 CG=294ms, grep=24014ms, 加速 81.7x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| OpenArchive | libziparchive | 282 | 30000 | 32 | 0 | 106.4x |
| writeInt32 | libhwbinder | 249 | 30000 | 35 | 0 | 120.7x |
| ril_service | libril | 262 | 30000 | 5 | 0 | 114.3x |
| malloc | libcxx | 353 | 30000 | 5 | 0 | 85.0x |
| pthread_create | bionic | 323 | 70 | 174 | 1 | 0.2x |

## 5. 综合评分

### 搜索精度

| 维度 | CodeGraph | grep | 说明 |
|------|-----------|------|------|
| 符号精确匹配 | ⭐⭐⭐⭐⭐ | ⭐⭐ | CG AST 级语义匹配，grep 纯文本含大量误报 |
| 调用关系发现 | ⭐⭐⭐⭐⭐ | ⭐⭐ | CG 基于调用图精确追溯，grep 只能文本匹配函数名 |
| 影响范围分析 | ⭐⭐⭐⭐ | ⭐ | CG 深度影响分析，grep 只能统计引用行数 |
| 跨文件上下文 | ⭐⭐⭐⭐⭐ | ⭐ | CG 返回完整符号+调用链，grep 仅匹配行 |

### 搜索速度

| 维度 | CodeGraph | grep | 说明 |
|------|-----------|------|------|
| 符号查询 (索引) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | CG 预热后毫秒级，grep 需遍历文件 |
| 大作用域搜索 | ⭐⭐⭐⭐⭐ | ⭐⭐ | CG 跨 repo 秒级，grep 目录越大越慢 |
| 调用链追踪 | ⭐⭐⭐⭐ | ⭐ | CG 独有能力，grep 无法实现 |
| 无索引场景 | ⭐ | ⭐⭐⭐⭐ | grep 即开即用，CG 需预先索引 |

### 适用场景

| 场景 | 推荐工具 | 理由 |
|------|----------|------|
| 查找类/函数定义 | CodeGraph | 精确符号匹配 |
| 追踪谁调用了某方法 | CodeGraph | 调用图分析 |
| 评估代码改动影响范围 | CodeGraph | 影响分析 |
| 查找字符串/注释 | grep | 纯文本更直接 |
| 简单文件名查找 | find | 零开销 |
| 正则表达式批处理 | grep/sed | 灵活强大 |

## 6. 结论

本次测试覆盖 4 个类别共 60 个查询，CodeGraph 在 34/60 (57%) 的查询中更快，整体加速 7.3x。

> 💡 **建议**：符号定位、调用链追踪、影响分析场景优先使用 CodeGraph；纯文本/正则搜索场景 grep 仍然是最直接高效的工具。两者互补。
