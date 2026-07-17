const tests = [
  {
    name: '原文(AI 检测前)',
    text: 'Nacos作为统一服务治理中心，承担两大核心功能。第一，服务注册与发现：pet-web、pet-service项目启动时自动注册至Nacos，服务调用时通过服务名称自动发现目标服务，内置负载均衡机制；第二，统一配置管理：数据库连接参数、文件上传大小限制、分页默认条数等全局配置全部存放Nacos，支持配置中文不乱码，修改配置后动态刷新至所有微服务，无需重启项目。',
  },
  {
    name: '格子达降重后(低风险)',
    text: 'Nacos在作为统一服务治理中心时，其职责可以概括为两条主线，首先，服务注册和发现工作需要进行，pet-web和pet-service等项目启动后会自动向Nacos进行注册，服务调用方可以通过名称来定位目标服务，Nacos内部集成了负载均衡方式，第二是统一配置管理，包括数据库连接参数、文件上传上限、分页默认条数等全局性配置都集中在Nacos中，同时保证中文配置没有乱码。配置修改完成后，系统可以动态地把这些配置推送到各个微服务，而且不需要对应用进行重启。',
  },
]

async function main() {
  console.log('=== PPL 文本对比 ===\n')
  for (const t of tests) {
    try {
      const resp = await fetch('http://localhost:8000/perplexity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t.text }),
      })
      const data = await resp.json() as any
      console.log(`【${t.name}】`)
      console.log(`  字数: ${t.text.length}`)
      console.log(`  PPL: ${data.ppl}`)
      console.log(`  burstiness: ${data.burstiness}`)
      console.log(`  sentence_count: ${data.sentence_count}`)
      console.log()
    } catch (e: any) {
      console.log(`【${t.name}】ERROR: ${e.message}\n`)
    }
  }
}
main()
