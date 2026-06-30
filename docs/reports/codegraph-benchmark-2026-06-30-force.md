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
| CodeGraph 更快 | 33 (55.0%) |
| grep 更快 | 27 (45.0%) |
| 持平 | 0 |
| CG 总耗时 | 96470ms |
| grep 总耗时 | 408684ms |
| 整体加速比 | 4.2x |

## 3. 各类别平均耗时对比

```
  系统APP          CG   │█████                                   │ 329ms
grep │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ 2847ms

  Framework      CG   │███████████████████████████████████████ │ 2211ms
grep │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ 2288ms

  Linux内核        CG   │███████████████████████████████████     │ 3596ms
grep │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ 4104ms

  Native代码       CG   │█                                       │ 295ms
grep │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ 18006ms

```

## 4.1 系统APP

### 符号搜索 (平均 CG=311ms, grep=7137ms, 加速 22.9x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| ContactSaveService | Contacts | 276 | 28763 | 30 | 0 | 104.2x |
| InCallPresenter | Dialer | 304 | 2300 | 30 | 20 | 7.6x |
| MmsUtils | Messaging | 287 | 2196 | 30 | 20 | 7.7x |
| BugleNotifications | Messaging | 280 | 1939 | 30 | 18 | 6.9x |
| SettingsActivity | Settings | 409 | 486 | 30 | 20 | 1.2x |

### 调用关系 (平均 CG=347ms, grep=2ms, 加速 0.0x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| onCreate | Settings | 386 | 2 | 1 | 0 | 0.0x |
| onResume | Settings | 392 | 3 | 1 | 0 | 0.0x |
| startActivity | Contacts | 283 | 2 | 41 | 0 | 0.0x |
| sendMessage | Messaging | 281 | 3 | 11 | 0 | 0.0x |
| onClick | Settings | 395 | 2 | 1 | 0 | 0.0x |

### 影响分析 (平均 CG=329ms, grep=1401ms, 加速 4.3x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| ContactSaveService | Contacts | 270 | 2706 | 289 | 1 | 10.0x |
| Utils | Settings | 431 | 844 | 170 | 1 | 2.0x |
| onCreate | Settings | 384 | 815 | 99 | 1 | 2.1x |
| startActivity | Contacts | 267 | 728 | 66 | 1 | 2.7x |
| BugleNotifications | Messaging | 295 | 1914 | 145 | 1 | 6.5x |

## 4.2 Framework

### 符号搜索 (平均 CG=5139ms, grep=4652ms, 加速 0.9x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| ActivityManagerService | base | 22691 | 17262 | 0 | 0 | 0.8x |
| SystemServer | base | 759 | 355 | 30 | 20 | 0.5x |
| IActivityManager | base | 754 | 1717 | 30 | 20 | 2.3x |
| AppOpsManager | base | 764 | 1681 | 30 | 20 | 2.2x |
| StorageManagerService | base | 728 | 2243 | 30 | 20 | 3.1x |

### 调用关系 (平均 CG=723ms, grep=3ms, 加速 0.0x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| registerReceiver | base | 681 | 3 | 1 | 0 | 0.0x |
| sendBroadcast | base | 690 | 3 | 1 | 0 | 0.0x |
| startService | base | 854 | 3 | 1 | 0 | 0.0x |
| bindService | base | 690 | 2 | 1 | 0 | 0.0x |
| onTransact | base | 701 | 2 | 1 | 0 | 0.0x |

### 影响分析 (平均 CG=771ms, grep=2210ms, 加速 2.9x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| ActivityManagerService | base | 799 | 2104 | 1150 | 1 | 2.6x |
| IActivityManager | base | 756 | 2166 | 71 | 1 | 2.9x |
| sendBroadcast | base | 705 | 2303 | 59 | 1 | 3.3x |
| startService | base | 754 | 2318 | 40 | 1 | 3.1x |
| ActivityThread | base | 843 | 2158 | 681 | 1 | 2.6x |

## 4.3 Linux内核

### 符号搜索 (平均 CG=7401ms, grep=10877ms, 加速 1.5x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| blk_mq_run_hw_queue | android14-6.1-lts | 30030 | 30000 | 0 | 0 | 1.0x |
| schedule | android14-6.1-lts | 1782 | 55 | 30 | 20 | 0.0x |
| do_fork | android14-6.1-lts | 1188 | 1563 | 2 | 0 | 1.3x |
| ext4_file_write_iter | android14-6.1-lts | 1275 | 16364 | 2 | 2 | 12.8x |
| blk_queue_bio | android14-6.1-lts | 2730 | 6405 | 0 | 1 | 2.3x |

### 调用关系 (平均 CG=1524ms, grep=3ms, 加速 0.0x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| kmalloc | android14-6.1-lts | 1345 | 2 | 63 | 0 | 0.0x |
| printk | android14-6.1-lts | 1437 | 3 | 63 | 0 | 0.0x |
| spin_lock | android14-6.1-lts | 1455 | 3 | 63 | 0 | 0.0x |
| kfree | android14-6.1-lts | 1753 | 2 | 63 | 0 | 0.0x |
| mutex_lock | android14-6.1-lts | 1632 | 3 | 63 | 0 | 0.0x |

### 影响分析 (平均 CG=1862ms, grep=1433ms, 加速 0.8x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| blk_mq_run_hw_queue | android14-6.1-lts | 1241 | 1300 | 82 | 1 | 1.0x |
| schedule | android14-6.1-lts | 1702 | 1719 | 5 | 1 | 1.0x |
| kmalloc | android14-6.1-lts | 2496 | 1476 | 43959 | 1 | 0.6x |
| spin_lock | android14-6.1-lts | 2627 | 1167 | 40318 | 1 | 0.4x |
| do_fork | android14-6.1-lts | 1244 | 1502 | 8 | 1 | 1.2x |

## 4.4 Native代码

### 符号搜索 (平均 CG=251ms, grep=30000ms, 加速 119.5x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| OpenArchive | libziparchive | 250 | 30000 | 6 | 0 | 120.2x |
| writeInt32 | libhwbinder | 253 | 30000 | 1 | 0 | 118.5x |
| ril_service | libril | 261 | 30000 | 6 | 0 | 115.1x |
| gsid | gsid | 245 | 30000 | 4 | 0 | 122.4x |
| SysfsCollector | pixel | 246 | 30000 | 30 | 0 | 122.0x |

### 调用关系 (平均 CG=333ms, grep=4ms, 加速 0.0x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| malloc | libcxx | 360 | 3 | 1 | 0 | 0.0x |
| free | libcxx | 388 | 3 | 23 | 0 | 0.0x |
| pthread_create | bionic | 300 | 3 | 63 | 0 | 0.0x |
| memcpy | bionic | 298 | 3 | 63 | 0 | 0.0x |
| open | bionic | 321 | 6 | 63 | 0 | 0.0x |

### 影响分析 (平均 CG=300ms, grep=24016ms, 加速 79.9x)

| 符号 | Repo | CG(ms) | grep(ms) | CG结果 | grep结果 | 加速比 |
|------|------|--------|----------|--------|----------|--------|
| OpenArchive | libziparchive | 284 | 30000 | 32 | 0 | 105.5x |
| writeInt32 | libhwbinder | 261 | 30000 | 35 | 0 | 114.7x |
| ril_service | libril | 272 | 30000 | 5 | 0 | 110.5x |
| malloc | libcxx | 345 | 30000 | 5 | 0 | 87.0x |
| pthread_create | bionic | 340 | 79 | 174 | 1 | 0.2x |

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

本次测试覆盖 4 个类别共 60 个查询，CodeGraph 在 33/60 (55%) 的查询中更快，整体加速 4.2x。

> 💡 **建议**：符号定位、调用链追踪、影响分析场景优先使用 CodeGraph；纯文本/正则搜索场景 grep 仍然是最直接高效的工具。两者互补。
