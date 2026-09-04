# Affordable Drug Alternatives

判断一个药能不能用更便宜的东西替代，并把判断依据摊开给人核对。
本文件是**词汇表**：只定义概念是什么，不记录实现、不记录决策理由（后者属于 `docs/adr/`）。

## 可替代性

**Regulatory Substitutability**（监管可替代性）:
两个 RxNorm 概念之间由权威来源（FDA Orange Book、FDA Purple Book、WHO ATC）裁定的关系。
每一条结论都能追溯到一个可以人工打开核对的源文件字段。
_Avoid_: substitutability（裸用，指代不明）、equivalence、interchangeability（后者是 Purple Book 的专有含义，只属于 Grade A 的一种）

**Therapeutic Alternative**（治疗替代方案）:
基于临床证据、指南或支付方行为认定的更便宜的治疗选择，包括超说明书用药和跨 ATC 类的替代。
**本项目不裁决这类关系**——它的证据形态是 RCT、指南与政策文件，没有可以人工核对的源文件字段。
本词条的用途是标记边界：凡属于此类的主张，都不进入产品。
_Avoid_: substitute、alternative（裸用）、off-label equivalence

**Rule**（规则）:
一次裁决的最小单位，形如 `A1`、`B7`、`C2`。它是本项目的**一等词汇**：
面向人的任何界面都显示完整 rule id，等级字母不单独出现。
_Avoid_: grade（单独指代一次裁决时）

**Grade**（等级）:
Rule 所属的族，表示可以采取的行动类别。仅用于分族，不用于指代具体裁决。
_Avoid_: score、rating、level

**Unknown**（无法判定）:
判定能力的缺口——标识符解析不到、缺少 ATC 编码、映射不到任何 Orange/Purple Book 产品。
与「确认无关系」相反：前者是缺口，后者是结论。Unknown 自成一族（`U*`），
不在 A→B→C→D 这条有序轴上；在多候选择优时排最末。
_Avoid_: D（用 D 表示无法判定）、low confidence、null

**Rule Catalogue**（规则目录）:
全部 Rule 的封闭枚举，是本项目对外的契约。裁决逻辑、导出数据与界面图例均由它派生；
新增或修改一条规则是一次有意的契约变更，不是实现细节。
_Avoid_: grade list、rule types

## 化学结构

**Structural Similarity**（结构相似度）:
两个分子作为指纹（Morgan / ChemBERTa 嵌入）的接近程度，本项目中以 Tanimoto 等度量表示。
它是**候选发现机制**：唯一职责是提出待裁决的药对，本身不构成任何可替代性主张。
相似度分值不与 Rule 并列呈现——同一分子的盐在此得分 1.000，而 FDA 并不判其等效。
_Avoid_: similarity（裸用）、chemical equivalence、match

## 费用

**Acquisition Cost**（进货成本）:
药房购入药品所付的价格，本项目中来自 CMS NADAC。
_Avoid_: price、cost（裸用）

**Reimbursement Rate**（报销率）:
支付方向提供方支付的金额，如 Medicare ASP、Medicaid net。
_Avoid_: price、cost（裸用）

**Patient Cost**（患者支付额）:
患者实际自付的金额，如 copay 或现金自费价。
_Avoid_: price、cost（裸用）

> **"Price" 在本项目中是禁用词。** 任何金额都必须说明它是上述三者中的哪一个。
> 三者数量级可差一个数量级以上，且脱离上下文（截图、图例、CSV 列名）时无法还原。

**Pricing Unit**（计价单位）:
金额所依附的单位（ML、EA 等）。跨计价单位的金额不可比较，因而不可相减。
_Avoid_: unit（裸用）
