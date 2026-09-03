# 剂型与强度语义对齐 — 文献综述与方法选择

生成于 2026-09-03。检索工具:WebSearch / WebFetch。

> **引用真实性**:下列每一条都是本次实际抓取到的文献,均带可解析的 URL 或 DOI。
> 无法取得全文的条目标注 **[仅摘要]** 或 **[仅元数据+检索片段]**,其结论只在标注范围内使用。
> 两处付费墙(ScienceDirect、EDQM PDF)返回 403,已用可访问的镜像或权威二次来源补齐,并注明。

---

## 0. 先修正任务前提:三个失败样本的真实根因

在检索之前先核实了本地数据。**结论与任务书里的假设不完全一致**,这直接改变了设计:

| 样本 | Orange Book 剂型字符串 | 强度 | 真实根因 |
|---|---|---|---|
| AZULFIDINE EN-TABS vs SULFASALAZINE | `TABLET, DELAYED RELEASE;ORAL` vs **两种都有**(`TABLET, DELAYED RELEASE` 与 `TABLET`) | 500MG / 500MG | **release characteristics**:系统返回了普通片 |
| DOXIL vs DOXORUBICIN HCl | `INJECTABLE, LIPOSOMAL;INJECTION` — **两侧完全相同** | `50MG/25ML (2MG/ML)` vs `20MG/10ML (2MG/ML)` | **强度**:浓度相同、总量不同 |
| AFINITOR DISPERZ vs EVEROLIMUS | `TABLET, FOR SUSPENSION;ORAL` — **两侧完全相同** | 5MG / 5MG | 返回了 EVEROLIMUS 的另一剂型变体 |

实证复现(`subst_data/grade.py` 现状):

```
parse_strength("50MG/25ML (2MG/ML)") -> {(2.0,'MG'), (50.0,'MG')}
parse_strength("20MG/10ML (2MG/ML)") -> {(2.0,'MG'), (20.0,'MG')}
交集 = {(2.0,'MG')}                    ← 非空即判同强度

dose_form_compatible(None, 'TABLET, DELAYED RELEASE')            -> True   ← 静默兜底
dose_form_compatible(['Oral Tablet'], 'TABLET, DELAYED RELEASE') -> False
dose_form_compatible(['Oral Tablet'], 'TABLET')                  -> True
```

**关键修正**:任务书假设 Orange Book 一侧是「自由文本、粒度粗」。实际相反——
Orange Book 的字符串**是精确的**(`TABLET, DELAYED RELEASE`、`INJECTABLE, LIPOSOMAL`),
**丢失粒度的是 RxNorm 一侧**(`Oral Tablet` 同时覆盖肠溶片和普通片)。
现有代码把 RxNorm 当作判定依据,并在 RxNorm 沉默时返回 `True`,
于是精确的一侧被粗糙的一侧拖平了。

这一点决定了后面的核心设计决策(见 §3)。

---

## 1. 结构化摘要

### 1.1 Ahnfelt E, Lagerlund O, Klint J, Fladvad M, Jarvis C, Chen T-J, Telonis P, Fitzmartin R. *Advancing Global Harmonization: Implementing Global Dose Form Attributes for Medicinal Products Identification.* Therapeutic Innovation & Regulatory Science, 2025.

- DOI: [10.1007/s43441-025-00838-3](https://doi.org/10.1007/s43441-025-00838-3) · PMID 40770533 · PMCID [PMC12579665](https://pmc.ncbi.nlm.nih.gov/articles/PMC12579665/) · **[全文]**
- **方法**:Global IDMP Working Group(FDA / EDQM / EMA / UMC)提出一组集中维护的
  「全球剂型属性」,各国本地剂型术语表映射到这组属性,而非两两互映(hub-and-spoke)。
- **数据**:2019 年一次映射评估,以 EDQM 为基准比对多个术语表。
- **报告的指标(本综述最重要的数字)**:一对一匹配率——
  **Health Canada 16%、US FDA 22%、CDISC 20%、SNOMED 45%**。
- **选定的四个属性**:basic dose form、administration method、intended site、
  release characteristics。**`transformation` 被明确排除**,理由是他们只处理
  *administrable*(可给药)剂型,不处理 *manufactured*(生产态)剂型。
- **release characteristics 的调和规则**:conventional+prolonged → prolonged;
  delayed+prolonged → prolonged;**conventional+delayed 取决于成分层面的特性**。
- **能否用在本任务**:**能,且是主要依据**。22% 这个数字直接预测了我的失败模式:
  FDA 侧术语与任何以 EDQM 为基准的表之间,五分之四对不上一对一映射,
  所以任何两两直连映射表都会系统性失败。
  **但有一处必须偏离**:他们排除 `transformation` 的理由在本任务不成立——
  Orange Book 记录的是 **manufactured** 剂型(`TABLET, FOR SUSPENSION`
  正是一个使用前需转化的生产态剂型),因此我必须保留这一分面。

### 1.2 Karapetian N, Vander Stichele R, Quintana Y. *Alignment of two standard terminologies for dosage form: RxNorm from the National Library of Medicine for the United States and EDQM from the European Directorate for the Quality in Medicines and Healthcare for Europe.* International Journal of Medical Informatics, 165:104826, 2022.

- DOI: [10.1016/j.ijmedinf.2022.104826](https://doi.org/10.1016/j.ijmedinf.2022.104826) · PMID [35870302](https://pubmed.ncbi.nlm.nih.gov/35870302/) · **[仅元数据+检索片段]**(ScienceDirect 403,PMC reCAPTCHA)
- **方法**:一名药学专业学生与一名剂型方向的临床药理学专家,依据 RxNorm 与 EDQM
  各自的技术文档定义,人工把 **120 个 RxNorm 剂型**对齐到 EDQM 剂型描述术语。
- **结论(片段原文大意)**:该对齐尚需进一步验证,但提供了一条无需繁琐人工重分类
  即可建立两个术语表互操作的路径。
- **能否用在本任务**:**能,但只作为方向确认,不作为可复用产物**。
  它证明了 RxNorm 剂型总量在 120 这个量级——对确定性规则+词表是完全可覆盖的规模,
  这支持我先做规则层而不是先上模型。抓不到全文,所以不引用它的任何具体匹配率。

### 1.3 SNOMED International (与 EDQM 合作). *EDQM to SNOMED CT Dose Form Map Guide*, §4.1 The Semantics of the Source and Target Dose Forms.

- URL: [docs.snomed.org/.../4.1-the-semantics-of-the-source-and-target-dose-forms](https://docs.snomed.org/implementation-guides/edqm-to-snomed-ct-dose-form-map-guide/4-mapping-principles/4.1-the-semantics-of-the-source-and-target-dose-forms) · **[全文]**
- **性质**:实施规范,不是研究论文。权威性高于综述性文献。
- **两条直接可用的规则**:
  1. **prolonged release 的定义是「由特殊制剂设计和/或生产方法达成」**,
     因此**不是由物质本身达成**。文中点名:含
     **haloperidol decanoate、insulin isophane、insulin zinc suspension**
     的产品**不应**被赋予 prolonged release 剂型,因为延长释放来自物质的修饰而非剂型。
  2. **EDQM 的属性对概念而言「NOT definitional」**,而 SNOMED 的属性是 definitional。
     因此「EDQM PDF 的特征值」与「SNOMED PDF 的逻辑定义」之间不要求完全匹配。
- **能否用在本任务**:**能,且是 §2.2 语义陷阱的权威出处**。
  第 2 条尤其重要:它说明**分面值不能被当成概念的充分定义**,
  所以我的比较必须是「分面级 diff + 显式规则」,而不是「分面全等 ⇒ 概念等价」。

### 1.4 EDQM Standard Terms(受控词表)

- 数据库: [standardterms.edqm.eu](https://standardterms.edqm.eu/) ·
  说明页: [edqm.eu/en/standard-terms-database](https://www.edqm.eu/en/standard-terms-database) ·
  官方 PDF 指南返回 403,内容经 SNOMED 指南与检索片段交叉确认 · **[仅二手确认]**
- **五个特征**:basic dose form、**transformation**、release characteristics、
  intended site、administration method。合规于 **ISO 11239**(IDMP 标准族)。
- **manufactured vs administrable 的定义**:描述生产件时称
  *manufactured dose form*,描述给药用的药品时称 *administrable dose form*。
  `transformation` 描述生产件在给药前是否以及如何被转化——
  例如 `Powder for solution for injection` 中的 "for solution for injection"
  表示需要复溶,转化后的可给药剂型是 `Solution for injection`。
- **能否用在本任务**:**能,作为分面 schema 的规范来源**。
  并且这里给出了保留 `transformation` 的正当性:Orange Book 的
  `TABLET, FOR SUSPENSION`、`POWDER, FOR SOLUTION` 全是 manufactured 剂型。

### 1.5 Ostropolets A, Zhuk A, Korchmar E, Ryan P, Reich C. *Developing RxNorm Extension: A Step Toward Global Drug Data Harmonization in Observational Drug Research.* AMIA Annual Symposium Proceedings, 2025:969–978.

- PMID 41726498 · PMCID [PMC12919553](https://pmc.ncbi.nlm.nih.gov/articles/PMC12919553/) · **[全文]**
- **方法**:把药物拆成 **active ingredients / brand names / dose forms / strength / suppliers**
  五类属性,分别映射到 RxNorm 或新建 RxE 概念,**避免直接映射到已有 RxNorm 概念**。
- **数据规模**:截至 2025-03 覆盖 **10 个国家的 12 个来源术语表**;
  复用 RxNorm 的 5,537 个成分,新增 2,116 个 RxNorm 没有的活性成分。
- **剂型的处理**:剂型匹配带 **precedence scoring,反映置信度层级**。
  明确报告的问题:「剂型在不同药物系统间名称或粒度不同」;
  来源只给泛化术语(如 "oral pill")时会误分类;
  国际市场口服溶液占口服 Clinical Drug 的 35.6%,而 RxNorm 只有 14%。
- **局限**:流程需要同时精通 SQL 与药学产品知识;来源词表常以非结构化方式表达产品;
  目前**没有对来源药物解析或映射的易用工具**;质量控制以人工为主。
- **能否用在本任务**:**能,是属性分解方法最强的工程佐证**。
  一个跨 10 国、持续维护的生产系统独立收敛到了同一设计。
  它的 **precedence scoring** 也直接支持我的分级判定(而非布尔)要求。

### 1.6 Nelson SJ, Zeng K, Kilbourne J, Powell T, Moore R. *Normalized names for clinical drugs: RxNorm at 6 years.* JAMIA 18(4):441–448, 2011.

- DOI: [10.1136/amiajnl-2011-000116](https://doi.org/10.1136/amiajnl-2011-000116) · **[仅摘要]**(全文需订阅)
- **能提供的**:RxNorm 在 clinical drug 层的建模理念——
  ingredient(s) + strength + dose form 三元组。
- **不能提供的**:摘要里**没有** TTY 层级、剂型粒度、盐/碱处理的技术细节。
  这些改用 NLM 官方技术文档(下条)。
- **能否用在本任务**:**有限**。作为 RxNorm 设计意图的引用,不作为技术细节来源。

### 1.7 U.S. National Library of Medicine. *RxNorm Technical Documentation, Appendix 5: Term Types (TTY)*.

- URL: [nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html](https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html) · **[全文]**
- **DF (Dose Form)**:例 `Oral Solution`。**DFG (Dose Form Group)**:例 `Oral Liquid`。
- **IN (Ingredient)**:「赋予药物其独特临床性质的化合物或母核」,用 USAN 命名,例 Fluoxetine。
- **PIN (Precise Ingredient)**:「成分的一种指定形式,可能有也可能没有临床活性。
  **多数 precise ingredient 是盐型或异构体形式**」,例 Fluoxetine Hydrochloride。
- **SCDC / SCDF / SCD / SBD**:成分+强度 / 成分+剂型 / 成分+强度+剂型 / 再+品牌名。
- **能否用在本任务**:**能,两处直接使用**。
  (a) DF 与 DFG 的例子(`Oral Solution` vs `Oral Liquid`)本身就展示了粒度差异;
  (b) **IN/PIN 的区分正是盐-碱归一的官方机制**——比较必须落在 IN(active moiety),
  而 PIN 承载盐型,这与任务书 §2.3 的要求一致且有官方定义支撑。

### 1.8 Liu F, Shareghi E, Meng Z, Basaldella M, Collier N. *Self-Alignment Pretraining for Biomedical Entity Representations (SapBERT).* NAACL 2021:4228–4238.

- DOI: [10.18653/v1/2021.naacl-main.334](https://doi.org/10.18653/v1/2021.naacl-main.334) ·
  [ACL Anthology](https://aclanthology.org/2021.naacl-main.334/) · 代码 `cambridgeltl/sapbert` · **[仅摘要]**
- **方法**:用 UMLS(400 万+ 概念)的同义关系做度量学习,自对齐生物医学实体表示空间。
- **指标**:六个 MEL 基准上取得 SOTA,且**无需任务特定监督**即达到 SOTA。
- **能否用在本任务**:**只能做候选生成,不能做判定**。两个理由:
  (1) 它优化的是**同义性**,而本任务的核心区分恰恰是**近义但不等价**
  (`TABLET` vs `TABLET, DELAYED RELEASE` 在任何同义性度量下都极近);
  (2) 嵌入相似度不可审计,而给药替代判定需要能说出「因为 release characteristics 不同」。
  规模上也不需要:RxNorm 剂型总量约 120 个(见 1.2),规则+词表足以覆盖。

### 1.9 Sung M, Jeon H, Lee J, Kang J. *Biomedical Entity Representations with Synonym Marginalization (BioSyn).* ACL 2020:3641–3650.

- [ACL Anthology 2020.acl-main.335](https://aclanthology.org/2020.acl-main.335/) ·
  代码 [dmis-lab/BioSyn](https://github.com/dmis-lab/BioSyn) · **[仅摘要]**
- **方法**:基于模型的候选选择 + 同义词边缘似然最大化,迭代更新候选以引入更难的负样本,
  避免从 40 万+ 候选中显式预选负样本。
- **指标**:四个生物医学实体规范化数据集(疾病、化学品、不良反应)上均为 SOTA,较此前最多提升 2.6%。
- **能否用在本任务**:**与 SapBERT 同一结论,且更弱**。
  它的评测实体类型(疾病/化学品/不良反应)不含剂型,
  而剂型的难点是**组合语义**(head noun + 修饰语),不是同义词表面形式。

### 1.10 Kimura E, Kawakami Y, Inoue S, Okajima A. *Mapping Drug Terms via Integration of a Retrieval-Augmented Generation Algorithm with a Large Language Model.* Healthcare Informatics Research 30(4):355, 2024.

- DOI: [10.4258/hir.2024.30.4.355](https://doi.org/10.4258/hir.2024.30.4.355) · PMID 39551922 ·
  PMCID [PMC11570653](https://pmc.ncbi.nlm.nih.gov/articles/PMC11570653/) · **[全文]**
- **方法**:BioBERT 生成嵌入 → Faiss 检索 top-20 候选 → 把候选嵌入提示,由 LLM 评估并排序。
  源:日本 NHI 药价编码;目标:OHDSI 标准词表(RxNorm + RxNorm Extension)。
- **指标(本综述第二重要的数字)**:
  - 命中率(正确答案落入候选):**Mixtral 8x7b 94.47%**、GPT-3.5 90.45%,基线 BioBERT 63.82%
  - **R-precision:Mixtral 仅 49.76%**(基线 23.37%)· MAP 0.56(基线 0.23)
- **能否用在本任务**:**能,但用法是「反面论证」**。
  高命中率(94%)配低 R-precision(50%)精确刻画了检索与判定的分工:
  LLM+嵌入很擅长**把正确答案放进候选集**,很不擅长**从候选里挑对**。
  这正是「③ 嵌入检索只做候选生成,永不做最终判定」的量化依据。

### 1.11 Faria D, Pesquita C, Santos E, Palmonari M, Cruz IF, Couto FM. *The AgreementMakerLight Ontology Matching System.* OTM Conferences (ODBASE) 2013, LNCS 8185:527–541.

- DOI: [10.1007/978-3-642-41030-7_38](https://doi.org/10.1007/978-3-642-41030-7_38) · **[仅元数据+检索片段]**(Springer 需登录)
- **方法**:面向计算效率的核心框架,在保留 AgreementMaker 灵活性与可扩展性的同时处理超大本体。
- **指标**:OAEI Anatomy 与 Large Biomedical Ontologies 两个 track,运行时表现优异;
  Anatomy track 上 F-measure 为当届最佳。持续开发,横跨 OAEI 九届。
- **能否用在本任务**:**不直接用,但界定了边界**。
  通用本体对齐系统解决的是「两个大本体、成千上万概念、结构丰富」的问题;
  本任务是「两个小词表(~120 vs ~100)、无类层次、区分点全在修饰语」。
  把 AML/LogMap 这类系统套上来是**用错工具**——它们的强项(推理修复、
  大规模剪枝)在这里没有用武之地,而它们的弱项(修饰语级语义)正是本任务的全部难点。

### 1.12 Babaei Giglou H, D'Souza J, Engel F, Auer S. *LLMs4OM: Matching Ontologies with Large Language Models.* ESWC 2024 Special Track on LLMs for Knowledge Engineering. arXiv:2404.10317.

- [arxiv.org/abs/2404.10317](https://arxiv.org/abs/2404.10317) · **[仅摘要]**
- **方法**:两阶段——retrieval 模块 + matching 模块,零样本提示,三种本体表示
  (concept、concept-parent、concept-children)。
- **指标**:20 个 OM 数据集;报告 LLM 「可以匹敌甚至超越传统 OM 系统,
  尤其在复杂匹配场景」。摘要**未给出**具体数值,也**未讨论**精度或幻觉方面的局限。
- **能否用在本任务**:**暂不采用**。摘要不提供精度数字与失败模式,
  而本任务的成本函数是不对称的(判错等价 ≫ 判不出来)。
  在没有可核对的精度数据之前,把它放进判定链是不可辩护的。
  它的两阶段结构(先检索后匹配)倒是与 1.10 一致,进一步支持「检索/判定分离」。

---

## 2. 方法谱系:适用边界与已知失败模式

| 方法族 | 适用边界 | 已知失败模式 | 本任务是否采用 |
|---|---|---|---|
| **字符串规则 / 精确匹配** | 词表小、拼写受控、区分点在词形 | 同义异形(`enteric-coated` vs `gastro-resistant`);词序;缩写 | **采用**,作为第 ① 层 |
| **词典 / 同义词表** | 同义变体可枚举;需人工维护 | 覆盖不到的新词;一词多义(`SOLUTION` 在 `POWDER, FOR SOLUTION` 里不是终态剂型) | **采用**,作为第 ② 层,词表与代码分离 |
| **分面分解 / 属性桥接** | 两侧粒度不同、但可被同一组属性刻画 | 属性抽取错误会沿链传播;属性非 definitional(1.3)时不能反推概念等价 | **采用,作为架构主干** |
| **通用本体对齐**(LogMap / AML) | 大本体、有类层次与逻辑公理、需一致性修复 | 小而扁平的词表上无结构可用;修饰语级语义不是其强项 | **不采用**(见 1.11) |
| **嵌入检索**(SapBERT / BioSyn) | 需要从大候选集召回;同义性是主要信号 | **近义但不等价**会被拉近——正是本任务的核心区分点;不可审计 | **不采用**(规模不需要;见 1.8/1.9) |
| **LLM / RAG** | 候选排序;非结构化来源解析 | 高命中率但 **R-precision ~50%**(1.10);幻觉;不可审计 | **不采用于判定**;必要时仅用于候选生成 |

---

## 3. 方法选择结论

### 3.1 采用:EDQM 五分面 hub-and-spoke + 确定性规则判定

**架构**:`RxNorm DF/DFG → 分面 ← Orange Book DF;Route`,两侧各自抽取,禁止 N×M 直连表。
依据:1.1 的 **FDA↔EDQM 一对一匹配率仅 22%**,以及 1.5 中一个生产系统跨 10 国收敛到同一设计。

**分面取 EDQM 的五个**(1.4),**不取 1.1 的四个**:
Orange Book 记录 **manufactured** 剂型,`TABLET, FOR SUSPENSION` / `POWDER, FOR SOLUTION`
必须由 `transformation` 承载。1.1 排除它的理由(只处理 administrable 剂型)在本任务不成立。

**不引入任务书提到的 `state of matter`**:它不在 EDQM 的五个特征里,
也不在 1.1 的四个属性里,且在本任务的失败样本中不承载任何区分。加它是无依据的扩张。

### 3.2 采用:精确侧优先,粗糙侧只能约束不能放行

这是本任务**最关键的一条**,来自 §0 的实证而非文献:

> 两个 Orange Book 产品比较时,**双方的分面都从 Orange Book 字符串抽取**。
> RxNorm 的 DF 只在 Orange Book 缺失时作为退路,且**只能收紧判定,不能放宽**。
> RxNorm 沉默(或只给 `Oral Tablet` 这类 DFG 级术语)时,
> 相应分面为 `UNKNOWN`,判定降级为 `UNKNOWN`——**绝不返回 True**。

现有代码 `if not rxnorm_forms: return True` 正是禁止项里的「静默兜底」,
它让精确的一侧被粗糙的一侧拖平。

### 3.3 采用:分级判定 + 分面级 diff

`EQUIVALENT | EQUIVALENT_WITH_CAVEAT | NOT_EQUIVALENT | UNKNOWN`,
每个判定携带触发规则、置信度、以及**具体哪个分面不同**。
依据:1.5 的 precedence scoring 用了同样的分级思路;
1.3 指出 EDQM 属性非 definitional,因此「分面全等」不足以推出概念等价,
必须由显式规则而非全等比较作出判定。

### 3.4 采用:强度独立成模,且区分「总量」与「浓度」

DOXIL 失败的根因是解析器把 `50MG/25ML (2MG/ML)` 压平成
`{(50,MG),(2,MG)}` 后按交集匹配。强度必须建模为**结构化的量**:
`total_amount`、`concentration(numerator/denominator)`、`per_unit`,
比较时**同类相比**,并由剂型语境(1.4 的 basic dose form)决定哪一种是可比的。
盐-碱归一落在 **RxNorm IN 而非 PIN**(1.7 的官方定义)。

### 3.5 放弃:嵌入检索、LLM、通用本体对齐系统

- **嵌入**(1.8/1.9):优化同义性,而本任务的区分点是近义不等价;规模上也不需要(~120 个剂型)。
- **LLM/RAG**(1.10/1.12):94% 命中率 vs 50% R-precision 的落差正说明它属于候选生成,不属于判定;
  且不可审计,与给药替代场景的不对称成本函数冲突。
- **AML/LogMap**(1.11):工具与问题不匹配——本任务的词表小而扁平,没有可供推理的结构。

**先做 ①② 并量化覆盖率;只有当规则层覆盖率触顶且仍有缺口时,才考虑把 ③ 引入候选生成。**

---

## 4. 本综述未能覆盖的

- **EDQM 官方 PDF 指南**(403)与 **Karapetian 等 2022 全文**(付费墙)未取得。
  五分面的定义经 SNOMED 指南与检索片段交叉确认,但**未见 EDQM 一手措辞**;
  1.2 的具体匹配率因此不予引用。
- **NCI Thesaurus / FDA SPL 剂型 C-code 词表**未在本轮检索中取得权威文档。
  设计中把它列为 FDA 侧锚点,但实现将以 Orange Book 字符串为准,
  待取得 C-code 映射后再作为交叉校验加入。
- **ISO 11239:2023 标准正文**为付费标准,未取得。相关内容均经 EDQM/SNOMED 二手确认。
