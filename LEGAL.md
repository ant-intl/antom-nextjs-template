# Legal Notices / 法律声明

## 1. Comment Language / 注释语言

Within this source code, the comments in Chinese shall be the original, governing version. Any comment in other languages are for reference only. In the event of any conflict between the Chinese language version comments and other language version comments, the Chinese language version shall prevail.

关于代码注释部分，中文注释为官方版本，其它语言注释仅做参考。中文注释可能与其它语言注释存在不一致，当中文注释与其它语言注释存在不一致时，请以中文注释为准。

## 2. Trademark / 商标

"Antom" and related logos are trademarks of Ant International and its affiliated companies, protected by applicable law. This template is an integration example provided to help merchants integrate with the Antom service; nothing in this repository grants any license to use the "Antom" name or marks, except as reasonably necessary to describe interoperability with the Antom service.

"Antom" 及相关标识是蚂蚁国际（Ant International）及其关联公司的商标，依法受法律保护。本模板是用于帮助商户集成 Antom 服务的示例代码；除为描述与 Antom 服务互操作性所合理必需外，本仓库不授予任何使用 "Antom" 名称或标识的许可。

## 3. AML / CFT / KYC Compliance / 反洗钱合规

By using this template, you acknowledge and agree that:

- You are solely responsible for complying with all applicable anti-money laundering, counter-terrorism financing, and know-your-customer (AML / CFT / KYC) requirements.
- This template must not be used to circumvent any AML / CFT / KYC control, sanctions screening, or other regulatory obligation.
- Your use of the Antom service remains subject to the separate agreement(s) between you and Antom, including all KYC and AML / CFT obligations therein. Nothing in this template waives or modifies those obligations.

使用本模板即表示你确认并同意：

- 你独自负责遵守所有适用的反洗钱、反恐怖融资及了解你的客户（AML / CFT / KYC）要求。
- 本模板不得被用于规避任何 AML / CFT / KYC 管控、制裁名单筛查或其他监管义务。
- 你对 Antom 服务的使用仍受你与 Antom 之间另行签署的协议约束（包括其中的 KYC 与 AML / CFT 义务）。本模板不豁免或变更上述义务。

## 4. Data Privacy (GDPR / PDPA) / 数据隐私（GDPR / PDPA）

This template processes payment-related data that may include personal data / personally identifiable information (PII) — such as a buyer's name, email, or phone number contained in API requests and webhook notifications.

When you deploy this template you act as a data controller and/or processor for that data, and you are responsible for compliance with all applicable data-protection laws, including the EU General Data Protection Regulation (GDPR) and applicable Personal Data Protection Acts (PDPA, e.g. Singapore / Malaysia). In particular you should:

- Establish a lawful basis and, where required, obtain consent before collecting payer data.
- Provide a privacy notice to data subjects and honour their rights (access, deletion, etc.).
- Minimise, secure, and retain personal data only for as long as necessary.
- Avoid logging raw payloads. Webhook and API payloads may contain PII; this template ships a `redactPII()` helper (`lib/log/redact.ts`) and masks sensitive fields before logging by default. Keep this behaviour when you extend logging.

Your processing of personal data through the Antom service is also governed by the separate agreement(s) between you and Antom.

本模板处理的支付相关数据可能包含个人数据 / 个人可识别信息（PII），例如 API 请求与 Webhook 通知中的买家姓名、邮箱或电话。

部署本模板时，你作为该等数据的数据控制者和/或处理者，须负责遵守所有适用的数据保护法律，包括欧盟《通用数据保护条例》（GDPR）及适用的《个人数据保护法》（PDPA，如新加坡 / 马来西亚）。尤其应：

- 在收集付款人数据前确立合法依据，并在需要时取得同意。
- 向数据主体提供隐私告知，并保障其权利（访问、删除等）。
- 最小化、安全地处理个人数据，且仅在必要期限内留存。
- 避免记录原始报文。Webhook 与 API 报文可能含 PII；本模板提供 `redactPII()` 工具（`lib/log/redact.ts`），默认在日志输出前对敏感字段脱敏。扩展日志时请保留该行为。

通过 Antom 服务处理个人数据，亦受你与 Antom 之间另行签署的协议约束。

## 5. For Demonstration Purposes Only / 仅供演示

This template is provided as-is for learning and evaluation purposes. It is **not production-ready** and may contain limitations (including in-memory data storage, incomplete error handling, or security implementations requiring customization). Do not deploy to production without thorough review and modification. To the maximum extent permitted under applicable laws, Antom provides no warranty and assumes no liability for losses arising from its use or deployment. By using this template, you are acknowledging and agreeing to this.

本模板以“现状”提供，仅供学习与评估之用，**不可直接用于生产环境**，且可能存在局限（包括内存级数据存储、不完整的错误处理，或需自行定制的安全实现）。未经充分审查与修改，请勿部署到生产环境。在适用法律允许的最大范围内，Antom 不提供任何担保，且不对因使用或部署本模板而产生的任何损失承担责任。使用本模板即表示你确认并同意上述内容。

## 6. Disclaimer / 免责声明

This template is provided "AS IS" under the MIT License (see [LICENSE](./LICENSE)). It is an integration example, not legal, compliance, or security advice. The notices above are general information only and do not constitute legal advice; consult your own legal and compliance counsel for your specific situation.

本模板依据 MIT 许可证（见 [LICENSE](./LICENSE)）以“现状”提供，是集成示例，而非法律、合规或安全建议。上述声明仅为一般性信息，不构成法律意见；请就你的具体情况咨询自己的法律与合规顾问。
