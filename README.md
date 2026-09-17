> 2026-09-11 화면 분리·순서 편집 업데이트: 기존 사용자는 `UI_UPDATE.md`의 적용 순서를 따르세요.
> 이번 변경은 11개 화면 모듈의 DOM 대역 실행, JS 구문, 금액/차트 데이터 및 JSP/Mapper 연결 검증을 수행했습니다. 아래 기존 API 검증 기록은 이전 버전 기준입니다.

# 부부 자산관리 시스템

처음 프로젝트를 살펴본다면 **[프로젝트 구조 안내](docs/PROJECT_GUIDE.md)**부터 읽으세요. 전체 구성도, 화면별 소스 위치, 거래 저장 흐름, 데이터 관계와 수정·검증 방법을 설명합니다.

기존 할부는 이제 월별 카드 결제 예정과 연결되며 납부 시 잔여 금액·개월이 자동 차감됩니다. **기존 DB에는 추가 마이그레이션이 필요합니다.** [할부 연결 및 적용 안내](docs/INSTALLMENT_FLOW.md)를 참고하세요.

「자산관리 시스템 설계서.pdf」 24쪽의 기능설계에 기반한 Java 21 / Spring Boot 4.1.1 / PostgreSQL / MyBatis / JSP 로컬 애플리케이션입니다.

## 실행 순서 (Windows 11)

1. ZIP을 `C:\DEV\asset-manager` 같은 로컬 폴더에 압축 해제합니다. OneDrive 동기화 폴더는 피합니다.
2. JDK 21과 PostgreSQL을 준비합니다. IntelliJ Project SDK와 Gradle JVM도 Java 21로 지정합니다.
3. PostgreSQL 관리자 계정으로 `db/create_database.sql`의 비밀번호를 변경하여 실행합니다. CREATE DATABASE는 트랜잭션 블록 밖에서 실행합니다.
4. 새 `asset_manager` DB에 **asset_user 계정으로** 접속하여 `db/schema.sql` → `db/seed.sql` 순서로 실행합니다. 기존 DB의 테이블에 덮어쓰는 마이그레이션 스크립트가 아닙니다. 별도 새 DB를 사용하세요.
5. 프로젝트 루트의 `application-local.example.yml`을 `application-local.yml`로 복사하고 DB 비밀번호를 입력합니다.
6. PowerShell에서 프로젝트 루트로 이동하여 아래 명령을 실행합니다.

```powershell
java -version
.\gradlew.bat clean build
.\gradlew.bat bootRun
```

7. 브라우저에서 [http://localhost:8080](http://localhost:8080)에 접속합니다. 기본 바인딩은 `127.0.0.1`이며 로그인은 없습니다.

IntelliJ에서는 `settings.gradle`이 있는 폴더를 열고 Gradle 동기화 후 `AssetManagerApplication`을 실행합니다. 실행 설정의 Working directory는 프로젝트 루트입니다.

### PostgreSQL 명령행 예시

`psql`이 PATH에 없다면 PostgreSQL 설치 폴더의 `bin\psql.exe`를 사용합니다. 비밀번호는 프롬프트에서 입력합니다.

```powershell
psql -U postgres -d postgres -f db/create_database.sql
psql -U asset_user -d asset_manager -f db/schema.sql
psql -U asset_user -d asset_manager -f db/seed.sql
```

`schema.sql`은 최초 1회 실행용입니다. `seed.sql`은 재실행해도 기본 카테고리가 중복 생성되지 않습니다. 비밀번호 변경값은 `application-local.yml`과 일치시킵니다.

### 수정 소스에서 WAR 생성

이 UI 업데이트 ZIP은 전체 소스이며, 이전 버전 WAR를 포함하지 않습니다.

```powershell
.\gradlew.bat clean build
java -jar .\build\libs\asset-manager.war
```

JSP는 실행 WAR에 `WEB-INF/views`로 포함됩니다. 실행 JAR로 패키징하지 않습니다. 최초 Gradle 실행에는 인터넷이 필요하며 Gradle Wrapper 및 Maven 의존성을 내려받습니다.

### 환경변수 방식

```powershell
$env:DB_URL="jdbc:postgresql://localhost:5432/asset_manager"
$env:DB_USER="asset_user"
$env:DB_PASSWORD="개인 비밀번호"
.\gradlew.bat bootRun
```

`application-local.yml`의 동일 속성이 설정되어 있으면 해당 파일의 구체적인 설정이 적용됩니다. 혼동을 피하려면 로컬 파일 방식과 환경변수 방식 중 하나를 사용하세요. 포트 변경은 `PORT` 환경변수 또는 `server.port`를 사용합니다.

## 구현 기능

- 대시보드: 순자산·총자산·총부채, 자산 구성, 월 수입/지출, 대분류 비중, 스냅샷 추이.
- 자산: 전체 요약 → 현금성 자산·적금·증권계좌, 등록/상세/수정/해지, 소유자·은행 코드, 잔액 보정 이력.
- 거래: 수입/지출/자산이동, 모달 거래 카드 다건 입력, 카테고리 2단계 및 즉시 추가, 기간·유형·귀속·카테고리·메모 필터, 원본을 남기는 수정/취소.
- 카드: 체크/신용, 연결계좌, 카드별 월 사용액·결제일정·실제 출금, 일시불/할부개월, 기존 할부 초기등록.
- 대출: 원금균등/원리금균등/만기일시상환 예상표, 실제 원금·이자 확인, 중도상환·수수료, 금리 변경 및 보존 이력.
- 예정거래: 달력, 1회/매주/매월/매년 지출, 카드·대출·적금 자동 예정 생성, 실제 날짜/금액 확인 후 확정, 일정 변경/취소.
- 증권: 계좌별 KRW/USD 예수금·보유종목·손익, 통합 동일 종목 합산, 예수금 포함 포트폴리오, 거래/배당 탭.
- 스냅샷: 수동 새로고침 및 앱 실행 중 매일 한국시각 07:00, 같은 날짜 복수 저장, 개별 계좌/대출/종목·환율 보존, 날짜별 마지막 스냅샷 추이, 두 시점 상세 비교.
- 설정: 연동 상태·개별 계좌 인증 설정 여부·스냅샷 시각 확인. 비밀값은 반환하지 않습니다.

## 반드시 구분한 업무 규칙

| 상황 | 수입/지출 | 자산/부채 |
|---|---|---|
| 계좌/현금 지출 | 지출 | 선택 계좌 감소 |
| 체크카드 사용 | 지출 | 당시 연결계좌 감소 |
| 신용카드 사용·할부 구매 | 전체 구매액 지출 | 은행 잔액 불변 |
| 실제 카드대금 출금 | 추가 지출 없음 | 실제 입력한 금액만 감소 |
| 적금 납입·계좌 간 이동 | 수입/지출 없음 | 출발 감소·도착 증가 |
| 대출 정기상환 | 이자만 지출 | 출금계좌 원금+이자 감소, 부채 원금 감소 |
| 중도상환 | 수수료만 지출 | 원금만 부채 감소 |
| 수동 잔액 보정 | 수입/지출 아님 | 조정 이력을 남기고 잔액 변경 |
| KIS 배당 데이터 반영 | 계좌 소유자에게 수입 연결 | API 잔액에 이미 포함되므로 다시 증가시키지 않음 |

자산/부채의 `OwnerCode`는 HUSBAND/WIFE뿐입니다. 화면의 공동 조회는 두 사람의 합산입니다. 거래의 `Attribution`은 JOINT/HUSBAND/WIFE입니다. 공동 조회는 세 귀속을 모두 합산하고, 개인 조회는 해당 개인 귀속만 집계합니다. 개인 자산이동 조회는 출발 또는 도착 계좌 소유자가 해당 개인인 이동을 표시합니다.

## KB국민카드 가져오기

기존 Chrome에서 PIN 로그인한 뒤 최초 한 번 확장 프로그램을 연결하면 자동 재연결됩니다. 카드 화면의 가져오기 버튼으로 이용내역 전체 페이지와 매출전표를 수집하고 카드별 결제액·할인·예상 적립을 확인합니다. 선택한 거래만 가계부에 저장합니다. Node.js·Chrome 설치 및 기존 DB 마이그레이션이 필요합니다. [설치·사용법과 현재 지원 범위](docs/KB_CARD_IMPORT.md)를 확인하세요.

## KIS 설정과 실제 지원 범위

기본값은 비활성입니다. Key가 없어도 수동 자산/거래 기능과 스냅샷은 실행됩니다.

```yaml
kis:
  enabled: true
  base-url: https://openapi.koreainvestment.com:9443
  app-key: "본인 발급 App Key"
  app-secret: "본인 발급 App Secret"
  # 서로 다른 명의의 계좌는 계좌별 인증정보를 설정할 수 있습니다.
  # 아래 숫자는 이 앱에 등록한 증권계좌의 id입니다.
  accounts:
    2:
      app-key: "해당 명의 Key"
      app-secret: "해당 명의 Secret"
```

해당 계좌의 금융기관은 KIS, 계좌번호는 `12345678-01`과 같은 8자리+상품코드2자리, KIS 연동 체크를 선택합니다. 설정 변경 후 앱을 재시작하고 상단 새로고침을 누릅니다.

구현한 HTTP 경로는 토큰 발급, 국내 잔고, 해외 체결기준 현재잔고, 해외 일별 매매내역입니다. 공식 예제의 필드명을 근거로 구현했으며 연속조회가 완료되기 전에는 잔고를 반영하지 않습니다. 응답 오류·필드 누락·미지원 통화가 있으면 해당 계좌의 기존 데이터를 유지하고 스냅샷에 실패 상태를 남깁니다. 주식 거래 주문 API는 호출하지 않습니다.

**실계좌 인증정보 없이 실제 KIS 서버에 연결 검증하지 못했습니다.** 로컬 모의 HTTP 응답으로 토큰·잔고·환율·매매 매핑, 중복 방지, 실패 시 보존 로직을 검증했습니다.

**미구현/제한 범위:** 배당 및 입출금의 KIS 자동 조회, 국내주식 매매내역 자동 조회는 구현되지 않았습니다. 확인한 공식 API 예제에서 배당·입출금 조회 명세를 확보하지 못해 가상의 엔드포인트를 만들지 않았습니다. 해외 매매는 현재 `OVRS_EXCG_CD=NAS` 조회이며 다른 시장·상품까지 전부 수집된다고 보장하지 않습니다. 국내 및 USD 해외 보유자산을 평가하며 다른 통화의 잔고가 있으면 갱신을 중단합니다. 실전 TR ID를 사용하므로 모의투자 URL만 변경해서 이용하는 방식은 지원하지 않습니다.

검증된 배당·입출금 데이터 수신 이후의 처리 파이프라인은 구현되어 있습니다. 설정 화면의 증권 거래 가져오기에서 동일한 규격의 외부 확인 자료를 반영할 수 있습니다. `externalId`는 **계좌 내에서 영구적으로 동일한 실제 거래 식별자**여야 합니다. 같은 데이터에 다른 식별자를 주면 별도 거래로 인식합니다. 금액은 API 잔액에 이미 반영된 상태를 전제로 합니다.

최초 해외 매매 조회는 최근 3개월, 이후 조회는 마지막 갱신일의 7일 전부터입니다. 자동으로 과거 전체 내역을 수집하는 백필 기능은 없습니다.

공식 참고:
- [Spring Boot 4.1.1 실행 요구사항](https://docs.spring.io/spring-boot/system-requirements.html)
- [한국투자증권 공식 API 예제](https://github.com/koreainvestment/open-trading-api)
- [해외주식 공식 함수](https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/overseas_stock/overseas_stock_functions.py)

## 프로젝트 구조

```text
asset-manager/
  build.gradle / settings.gradle / gradlew / gradlew.bat
  gradle/wrapper/                 실제 Wrapper JAR 포함
  application-local.example.yml
  db/                            DB 생성·DDL·초기 코드
  src/main/java/com/family/asset/
    controller/                  화면·REST 컨트롤러
    service/                     거래·잔액·예정·대출·스냅샷 업무
    mapper/                      MyBatis 인터페이스
    dto/                         검증 DTO 및 명령/응답 record
    enums/                       내부 코드와 한글 표시명
    kis/                         외부 API·인증·정규화 상태
    config/                      JSON 금액 직렬화
    exception/                   공통 HTTP 예외 처리
  src/main/resources/
    application.yml / mapper/*.xml / static/js/common/*.js / static/js/pages/*.js / static/app.css
  src/main/webapp/WEB-INF/views/*.jsp / common/*.jspf
  src/test/java/                 대출 계산 테스트
  tests/api_smoke.py             실제 API 시나리오 검증
  docs/                          요구사항 대응표·구현 판단·검증 결과
```

각 DB 금액은 `numeric(24,2)`, Java는 `BigDecimal`입니다. 환율/수량에는 8자리 소수 정밀도를 사용합니다. JSON 금액은 문자열로 반환하여 브라우저 정밀도 손실을 피합니다. 화면 합산은 BigInt 고정소수 연산을 사용하며 그래프 좌표·비율에만 Number를 사용합니다.

2인 로컬 사용의 단순성과 일관성을 위해 잔액을 쓰는 작업은 공통 PostgreSQL transaction advisory lock으로 직렬화합니다. 거래·효과·부채·예정 완료 상태 변경은 단일 Spring 트랜잭션입니다. KIS 네트워크 호출은 DB 트랜잭션 밖에서 실행하고, 한 계좌의 완성된 결과를 한 번에 반영합니다. 금융 원장은 물리 삭제하지 않습니다.

## 화면 경로

| 경로 | 화면 |
|---|---|
| `/` | 대시보드 |
| `/assets` | 전체 자산 요약 |
| `/cash`, `/savings`, `/securities`, `/cards` | 자산별 화면 |
| `/loans` | 대출 및 상세 모달 |
| `/transactions` | 거래내역/다건 입력 |
| `/planned` | 예정거래 달력 |
| `/snapshots` | 이력/추이/시점 비교 |
| `/settings` | 시스템·연동 설정 안내 |

REST API 상세는 `docs/API.md`, 구현 판단 및 제한은 `docs/DECISIONS.md`, 검증은 `docs/TEST-RESULTS.md`를 참고하세요.

## 테스트

```powershell
.\gradlew.bat test
```

API 검증은 Python 3 표준 라이브러리만 사용합니다. **별도로 만든 테스트 DB에 schema/seed를 적용한 앱**을 대상으로 실행하세요. 테스트는 신규 테스트 계좌와 보존되는 거래 이력을 생성하므로 실제 개인 데이터 DB에서 실행하면 안 됩니다.

```powershell
python tests/api_smoke.py http://127.0.0.1:8080
```

자동 스케줄은 앱이 실행 중일 때만 동작합니다. PC나 앱이 꺼진 동안의 07:00 스냅샷을 사후에 만들어 과거로 위장하지 않습니다. 최신 상태는 새로고침으로 저장합니다.

화면별 수정 위치와 순서 저장 API는 `MAINTENANCE.md`를 참고하세요.
