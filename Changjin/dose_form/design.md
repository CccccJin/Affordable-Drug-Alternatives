# 剂型与强度语义对齐 — 设计

配套文档:[`lit-review.md`](lit-review.md)(文献依据)、`LIMITATIONS.md`(失效边界)。

---

## 1. 架构:hub-and-spoke,不做直连映射

```
RxNorm DF/DFG ──┐                     ┌── Orange Book "DF;Route"
                ├──► DoseFormFacets ◄─┤
openFDA dosage_form ┘                 └── (未来) NCI Thesaurus C-code
                          │
                          ▼
                 compare_dose_forms()  ──► DoseFormVerdict
                          │                 + 触发规则 + 置信度 + 分面级 diff
```

**为什么不做 N×M 直连表**:Ahnfelt 等 2025 报告 EDQM 与 US FDA 剂型术语的
一对一匹配率仅 **22%**(Health Canada 16%、CDISC 20%、SNOMED 45%)。
维护一张 RxNorm×OrangeBook 的直连表意味着为每个新术语维护 N 条边;
分面桥接只需为每个术语维护一次抽取。OHDSI 的 RxNorm Extension 跨 10 国 12 个词表
独立收敛到同一设计(Ostropolets 等 2025)。

---

## 2. 分面 schema

采用 **EDQM Standard Terms 的五个特征**(ISO 11239 族)。

| 分面 | 取值 | 来源依据 |
|---|---|---|
| `basic_dose_form` | tablet / capsule / solution / suspension / injection / cream / … | EDQM;Ahnfelt 2025 四属性之一 |
| `transformation` | none / for_suspension / for_solution / for_injection / for_reconstitution | EDQM 五特征之一 |
| `release` | conventional / delayed / prolonged / pulsatile / **unknown** | EDQM;Ahnfelt 2025 四属性之一 |
| `intended_site` | oral / intravenous / ophthalmic / topical / … | EDQM;Ahnfelt 2025 四属性之一 |
| `administration_method` | swallowing / injection / instillation / … | EDQM;Ahnfelt 2025 四属性之一 |
| `carrier`(**本项目扩展**) | none / liposomal / nanoparticle / lipid_complex / pegylated | 见 §2.2 |

### 2.1 为什么保留 `transformation`,而 Ahnfelt 2025 排除了它

Ahnfelt 等排除 `transformation`,理由是他们的全球属性只覆盖 **administrable**(可给药)剂型。
**本任务不成立**:Orange Book 记录的是 **manufactured**(生产态)剂型。
EDQM 对二者的区分明确——生产件称 manufactured dose form,给药前经转化后的
称 administrable dose form,`transformation` 描述是否以及如何转化。

失败样本 `AFINITOR DISPERZ` 的 `TABLET, FOR SUSPENSION` 正是一个 manufactured 剂型:
`for suspension` 表示给药前需分散。若丢掉这一分面,它与普通 `TABLET` 无从区分。

### 2.2 为什么新增 `carrier`,而它不在 EDQM 五特征里

EDQM 的五个特征刻画不了脂质体与普通注射剂的差别——两者的
basic dose form、intended site、administration method、release 都可以相同。
Orange Book 却把它写进剂型字符串(`INJECTABLE, LIPOSOMAL`)。

这是一个**有意识的扩展**,不是对 EDQM 的误读。理由:
载体系统决定药代动力学,FDA 也据此单独评级。本设计把它作为独立分面,
并在规则表中给予「一律不等价」的最强约束(R-06)。

### 2.3 为什么不引入任务书提到的 `state of matter`

它不在 EDQM 的五个特征里,也不在 Ahnfelt 2025 的四个属性里,
且在三个失败样本中不承载任何区分。加入它是无依据的扩张,
会增加一个永远返回 `UNKNOWN` 的分面并拉低整体覆盖率。

---

## 3. 判定规则表

判定值:`EQUIVALENT | EQUIVALENT_WITH_CAVEAT | NOT_EQUIVALENT | UNKNOWN`

规则**按顺序求值,先命中先返回**。顺序本身编码了优先级:
否定性规则(NOT_EQUIVALENT)全部排在肯定性规则之前,
因为本场景的成本函数不对称——判错等价的代价远大于判不出来。

| # | 条件 | 判定 | 置信度 | 依据 |
|---|---|---|---|---|
| **R-01** | 任一侧 `basic_dose_form` 为 unknown | `UNKNOWN` | — | 保守性要求:抽不出就不猜 |
| **R-02** | `intended_site` 两侧已知且不同 | `NOT_EQUIVALENT` | high | 任务书 §2.1;给药部位不同即不同产品 |
| **R-03** | `release` 两侧已知且不同 | `NOT_EQUIVALENT` | high | EDQM release characteristics;缓释与速释从不互换 |
| **R-04** | `release` 任一侧 unknown 且另一侧非 conventional | `UNKNOWN` | — | **本设计核心**,见 §4 |
| **R-05** | `transformation` 两侧已知且不同 | `EQUIVALENT_WITH_CAVEAT` | low | EDQM;需人工复核,不可直接判等价 |
| **R-06** | `carrier` 两侧不同(含一侧 none) | `NOT_EQUIVALENT` | high | §2.2;PK 由载体决定,FDA 不给 AB 评级 |
| **R-07** | `basic_dose_form` 不同,且不在 {tablet, capsule} 对内 | `NOT_EQUIVALENT` | high | 基础剂型不同 |
| **R-08** | `basic_dose_form` 为 tablet↔capsule,其余分面全等 | `EQUIVALENT_WITH_CAVEAT` | medium | 任务书 §2.1:可能可替代但必须降级标注 |
| **R-09** | `administration_method` 两侧已知且不同 | `EQUIVALENT_WITH_CAVEAT` | low | EDQM 属性非 definitional(SNOMED 指南),不足以单独否定 |
| **R-10** | 全部已知分面相等 | `EQUIVALENT` | high | — |
| **R-11** | 以上均未命中 | `UNKNOWN` | — | 显式兜底,**在返回值中标记** |

### 3.1 R-09 为什么只降级不否定

SNOMED 的 EDQM 映射指南明确指出:**EDQM 中 PDF 概念的属性对该概念而言不是
definitional 的**(“the attributes of a PDF concept in EDQM are NOT definitional”),
因此不要求 EDQM PDF 的特征值与 SNOMED PDF 的逻辑定义完全匹配。

推论:分面不等**不能**自动推出概念不等。
`intended_site`、`release`、`carrier` 之所以能给出 `NOT_EQUIVALENT`,
是因为它们各自另有监管或药理依据(R-02/R-03/R-06),不是因为「分面不同」这一事实本身。
`administration_method` 没有这样的独立依据,故只降级。

---

## 4. 核心设计决策:精确侧优先,粗糙侧只约束不放行

这一条不来自文献,来自对本项目失败样本的实证(见 `lit-review.md` §0)。

现有实现:

```python
def dose_form_compatible(rxnorm_forms, ob_dosage_form) -> bool:
    if not rxnorm_forms or not ob_dosage_form:
        return True          # ← 静默兜底
```

实测:

```
dose_form_compatible(None, 'TABLET, DELAYED RELEASE')            -> True
dose_form_compatible(['Oral Tablet'], 'TABLET, DELAYED RELEASE') -> False
dose_form_compatible(['Oral Tablet'], 'TABLET')                  -> True
```

问题不在于 Orange Book 的字符串粗糙——**它是精确的**(`TABLET, DELAYED RELEASE`)。
丢失粒度的是 RxNorm:`Oral Tablet` 同时覆盖肠溶片与普通片。
现有代码却把 RxNorm 当判定依据,并在其沉默时放行。

**新规则**:

1. 两个 Orange Book 产品比较时,**双方分面都从 Orange Book 字符串抽取**。
2. RxNorm DF/DFG 仅在 Orange Book 缺失时作为退路,且**只能收紧,不能放宽**。
3. RxNorm 只给 DFG 级术语(`Oral Tablet`、`Oral Liquid`)时,
   `release` 分面为 `UNKNOWN` 而**不是** `conventional`——
   这正是 R-04 存在的原因:一侧 unknown、另一侧 delayed,结果是 `UNKNOWN` 而非 `EQUIVALENT`。

---

## 5. 语义陷阱:长效来自制剂还是来自分子

SNOMED 的 EDQM 映射指南:prolonged release 的定义是
**「由特殊制剂设计和/或生产方法达成」**,因此不是由物质本身达成。
指南点名 **haloperidol decanoate、insulin isophane、insulin zinc suspension**:
这类产品**不应**被赋予 prolonged release 剂型,因为延长释放来自物质的修饰。

**实现方式**:`normalize_dose_form()` 接受一个可选的 `ingredient` 参数。
词表 `moiety_release.csv` 列出「长效来自分子修饰」的成分模式
(`*DECANOATE`、`*ENANTHATE`、`INSULIN ISOPHANE`、`INSULIN ZINC` …)。
命中时,即便剂型字符串含 `EXTENDED RELEASE` 之类字样,
`release` 也**不**被置为 prolonged,而是记录一条 `moiety_derived_release` 标记。

这条必须做对,否则在长效针剂上会系统性出错——
而长效针剂恰恰是精神科与内分泌科用量最大的品类之一。

---

## 6. 强度归一化(独立模块)

**与剂型完全分离**。`normalize_strength(raw, context)` 只接受剂型分面作为**语境**,
不反过来修改剂型。

### 6.1 结构化表示,而非扁平集合

现状的失败:

```
parse_strength("50MG/25ML (2MG/ML)") -> {(2.0,'MG'), (50.0,'MG')}
parse_strength("20MG/10ML (2MG/ML)") -> {(2.0,'MG'), (20.0,'MG')}
交集 = {(2.0,'MG')}   ← 非空即判同强度 → DOXIL 失败
```

总量与浓度被压进同一个集合,再按交集匹配,于是**浓度相同即可蒙混过关**。

新表示:

```python
@dataclass(frozen=True)
class Quantity:      value: float;  unit: str        # 归一到 MG / ML / UNITS
@dataclass(frozen=True)
class NormalizedStrength:
    total:         Quantity | None     # "50MG"      —— 每个包装单位的总量
    concentration: tuple[Quantity, Quantity] | None   # ("2MG","1ML")
    per_unit:      Quantity | None     # "40MG/TABLET"
    ratio:         tuple[float, float] | None         # "1:1000"
    components:    tuple[...]          # 复方:每成分一个向量
    flags:         frozenset[str]      # 显式标记:salt_normalized / assumed_* / unparsed_*
```

### 6.2 比较规则

| 条件 | 判定 |
|---|---|
| 两侧都有 `total` 且相等(容差内) | `EQUIVALENT` |
| 两侧都有 `total` 且不等 | `NOT_EQUIVALENT` |
| 仅浓度相同、总量不同 | `NOT_EQUIVALENT`(**DOXIL 案例**) |
| 仅浓度相同、总量一侧缺失 | `UNKNOWN` |
| 剂型为定量单剂型(tablet/capsule)时,`per_unit` 参与比较 | 按 `per_unit` |
| 剂型为液体且两侧只有浓度 | `EQUIVALENT_WITH_CAVEAT`(总量由包装决定,不由产品决定) |

**同类相比**:total 与 total 比,concentration 与 concentration 比。
不同类之间不比较,返回 `UNKNOWN`。

### 6.3 盐-碱归一落在 active moiety

RxNorm 官方定义:**IN**(Ingredient)是「赋予药物其独特临床性质的化合物或母核」;
**PIN**(Precise Ingredient)是「成分的一种指定形式……多数是盐型或异构体形式」。

因此比较必须落在 **IN** 层。Orange Book 的 `EQ 40MG BASE` 写法本身就是
在声明「按碱计」,解析时置 `salt_normalized` 标记。
无法确定是按盐计还是按碱计时 → `UNKNOWN`,**不猜**。

### 6.4 容差是配置项

`config.toml` 中的 `strength.relative_tolerance`(默认 `1e-6`)与
`strength.absolute_tolerance_mg`(默认 `0.0`)。
不在代码里出现魔数。默认值刻意极严——强度是可精确表达的量,
宽容差只会掩盖解析错误。

---

## 7. 词表与代码分离

```
dose_form/
  vocab/
    basic_dose_form.csv       # 词形 -> basic_dose_form
    release.csv               # 词形 -> release(含 enteric-coated ≡ delayed)
    transformation.csv
    intended_site.csv
    administration_method.csv
    carrier.csv
    moiety_release.csv        # §5 的成分模式
    unit.csv                  # 单位 -> 归一单位 + 换算系数
  meta.json                   # 每张表的来源、版本、快照日期
```

词表为 CSV,带 `source` 与 `snapshot_date` 列。
更新词表**不需要改代码**。`meta.json` 记录快照日期——
Ostropolets 等 2025 指出来源词表持续变动,复现不了的结果没有意义。

---

## 8. 接口

```python
normalize_dose_form(raw: str, source: Source, *, ingredient: str | None = None) -> DoseFormFacets
compare_dose_forms(a: DoseFormFacets, b: DoseFormFacets) -> DoseFormVerdict
normalize_strength(raw: str, context: DoseFormFacets | None = None) -> NormalizedStrength
compare_strengths(a: NormalizedStrength, b: NormalizedStrength, *, context=None) -> StrengthVerdict
```

每个 `*Verdict` 携带:

```python
verdict:    Equivalence            # 四级枚举
rule:       str                    # "R-03"
confidence: Confidence             # high | medium | low | none
diff:       tuple[FacetDiff, ...]  # 哪个分面不同,两侧各是什么
notes:      tuple[str, ...]        # 显式 fallback 标记
```

`diff` 直接面向用户展示,是可解释性的来源。
