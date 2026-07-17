#!/bin/bash
# Phase 0 验收脚本
# 前置：用户已重启 Docker Desktop（修复端口转发），托盘图标变绿
#
# 用法：在 projects/heartfelt-ai/ 目录下 bash scripts/phase0-verify.sh
# 全部 PASS = Phase 0 完成

set -e

cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; FAILED=1; }
FAILED=0

echo "=== 验收 1: docker compose ps 三容器 healthy ==="
HEALTHY=$(docker compose ps --format '{{.Service}}:{{.Health}}' | grep -c 'healthy' || true)
if [ "$HEALTHY" -ge 3 ]; then pass "三容器 healthy"; else fail "只看到 $HEALTHY/3 healthy"; docker compose ps; fi

echo ""
echo "=== 验收 2: host 端口监听 (5432/6379/9000/9001) ==="
for p in 5432 6379 9000 9001; do
  if netstat -ano 2>/dev/null | grep LISTENING | grep -q ":$p "; then pass "host:$p listening"; else fail "host:$p NOT listening"; fi
done

echo ""
echo "=== 验收 3: pnpm migration:run ==="
cd backend
if pnpm migration:run 2>&1 | tail -5; then pass "migration 成功"; else fail "migration 失败"; fi

echo ""
echo "=== 验收 4: PG 里 5 张表 + vector 扩展 ==="
TABLES=$(docker exec heartfelt-postgres psql -U heartfelt -d heartfelt -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
echo "表数量: $TABLES (期望 6: 5 业务表 + typeorm_migrations)"
if [ "$(echo $TABLES | tr -d ' ')" -ge "6" ]; then pass "表已建"; else fail "表数不对"; fi
VECTOR=$(docker exec heartfelt-postgres psql -U heartfelt -d heartfelt -t -c "SELECT installed_version FROM pg_available_extensions WHERE name='vector';")
echo "vector: $VECTOR"
if echo "$VECTOR" | grep -q '0\.'; then pass "vector 扩展已启用"; else fail "vector 未启用"; fi

echo ""
echo "=== 验收 5: pnpm start:dev (后台启动 + 探活) ==="
pnpm start:dev > /tmp/nest.log 2>&1 &
NEST_PID=$!
echo "NestJS PID=$NEST_PID, 等启动 15 秒..."
sleep 15
if curl -s http://localhost:3000/api/v1/health | grep -q '"status":"ok"'; then pass "NestJS 起来"; else fail "NestJS 没起"; tail -30 /tmp/nest.log; kill $NEST_PID; exit 1; fi

echo ""
echo "=== 验收 6: 上传测试 docx ==="
UPLOAD=$(curl -s -X POST http://localhost:3000/api/v1/papers/upload -F "file=@test/fixtures/sample-paper.docx")
echo "响应: $UPLOAD"
PAPER_ID=$(echo "$UPLOAD" | grep -oE '"paperId":"[^"]+"' | sed 's/"paperId":"//;s/"//')
if [ -n "$PAPER_ID" ]; then pass "上传成功 paperId=$PAPER_ID"; else fail "上传失败"; fi

echo ""
echo "=== 验收 7: 查询单篇 ==="
GET=$(curl -s http://localhost:3000/api/v1/papers/$PAPER_ID)
echo "响应: $GET"
if echo "$GET" | grep -q "$PAPER_ID"; then pass "查询成功"; else fail "查询失败"; fi

echo ""
echo "=== 验收 8: MinIO bucket 里有文件 ==="
sleep 2  # 等 minio 写完
MC_OUT=$(docker exec heartfelt-minio mc ls --recursive local/heartfelt-papers/ 2>&1)
echo "$MC_OUT"
if echo "$MC_OUT" | grep -q 'original.docx'; then pass "MinIO 里有文件"; else fail "MinIO 里没文件"; fi

echo ""
echo "=== 收尾 ==="
kill $NEST_PID 2>/dev/null || true

echo ""
if [ "$FAILED" = "0" ]; then
  echo -e "${GREEN}========== Phase 0 全部验收通过 ==========${NC}"
  echo "MinIO 控制台: http://localhost:9001 (heartfelt / heartfelt_dev)"
  echo "可以勾 PLAN.md 的 Phase 0 checkbox 了"
else
  echo -e "${RED}========== 有验收未通过,看上面 [FAIL] ==========${NC}"
fi
