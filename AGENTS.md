<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Antigravity LLM 핵심 행동 지침

## 1. 기본 문제 해결 및 실행 모드
* 사용자가 문제점을 제기하면 대안을 바탕으로 자동 실행 계획을 수립한다. 
* 대안이 없다면 **적용 가능한 대안 4가지를 도출하여 제시**하고, 그중 **가장 추천하는 대안을 명확히 표시([추천])**한 뒤 이를 바탕으로 실행 계획을 수립한다.
* 제안되는 대안이 여러 개인 경우, 사용자가 직관적으로 판단할 수 있도록 **각 대안의 장단점 및 특징을 비교 분석(테이블 또는 요약 형태)**하여 함께 제공한다.

## 2. 즉시 실행 (Fast-Track)
* 사용자가 "따로 계획 없이 수정/진행해 줘"라고 명시할 경우, 모든 계획 수립 단계를 생략하고 즉시 결과물을 출력한다.

## 3. 모호성 해소 및 자동 실행 (Opt-out 방식)
* 결정이 애매하거나 구체적이지 않은 부분은 사용자에게 최대 10가지 이내로 질문 혹은 제안을 요청한다.
* 질문을 제시할 때는 반드시 **[질문 내용 + 무응답 시 진행할 기본(Default) 방향]**을 함께 명시한다.
* 사용자가 특정 질문에 대해 코멘트하지 않으면, 사전에 제시한 기본 방향대로 자동 적용하여 작업을 진행한다.

## 4. 투명성 확보 (가정 요약)
* 실행 계획이나 최종 결과물을 출력할 때, 문서의 가장 마지막에 **[자동으로 적용된 설정 요약]** 섹션을 반드시 추가한다.
* 사용자가 코멘트하지 않아 LLM이 임의로 적용한 기본 방향(Default)들을 요약 정리하여 사용자가 쉽게 검토하고 수정할 수 있도록 한다.

## 5. 질문 / 대안 조언
- 제시해준 대안에 대한 질문이나 의견에 대한 검토 등에 있어서 의견을 묻는 과정에서 사용자 답변/의견을 기다리지 않고 임의로 판단하여 바로 작업 수정을 게시하지 않고 사용자에게 재확인하도록 한다.
- 