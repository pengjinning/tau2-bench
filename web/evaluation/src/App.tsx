import { Alert, Button, Tag, Tooltip } from 'antd'
import {
  ExperimentOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useCallback, useEffect, useState } from 'react'
import { getHealth, toErrorMessage } from './api/client'
import type { Results, RunConfig } from './api/types'
import { readHistory, writeHistory, type EvaluationRecord } from './results'
import type { Page } from './page'
import NewRunPage from './pages/newRun/NewRunPage'
import ResultsPage from './pages/results/ResultsPage'
import './AppLayout.css'

export default function App() {
  const [page, setPage] = useState<Page>('new')
  const [backendUp, setBackendUp] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [history, setHistory] = useState<EvaluationRecord[]>([])
  const [storageError, setStorageError] = useState<string | null>(null)

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore persisted history once.
      setHistory(readHistory(localStorage, sessionStorage))
    } catch (error) {
      setStorageError(toErrorMessage(error))
    }
  }, [])

  const checkBackend = useCallback(async (manual = false) => {
    if (manual) setChecking(true)
    try {
      await getHealth()
      setBackendUp(true)
      setHealthError(null)
    } catch (error) {
      setBackendUp(false)
      setHealthError(toErrorMessage(error))
    } finally {
      if (manual) setChecking(false)
    }
  }, [])

  // 挂载时探测一次后端健康状态
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 异步回调中 setState，非同步级联
    void checkBackend()
  }, [checkBackend])

  useEffect(() => {
    if (!running) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [running])

  function handleDone(results: Results, config: RunConfig) {
    const record = { id: crypto.randomUUID(), config, results }
    const records = [record, ...history].slice(0, 20)
    setHistory(records)
    try {
      if (storageError) throw new Error('原始历史存储不可用或损坏，未覆盖。')
      writeHistory(localStorage, records)
    } catch (error) {
      setStorageError(`结果已保留在当前页面，但未保存到浏览器：${toErrorMessage(error)}。请导出 JSON 后再关闭。`)
    }
    setPage('results')
  }

  return (
    <div className="app-shell">
      <aside className="app-sider">
        <div className="app-logo">
          微语
          <div className="app-logo-sub">Agent 评测平台</div>
        </div>
        <nav className="app-nav">
          <Button
            type={page === 'new' ? 'primary' : 'text'}
            block
            icon={<ExperimentOutlined />}
            onClick={() => setPage('new')}
            className="app-nav-btn"
          >
            新建评测
          </Button>
          <Button
            type={page === 'results' ? 'primary' : 'text'}
            block
            icon={<HistoryOutlined />}
            onClick={() => setPage('results')}
            className="app-nav-btn"
          >
            历史结果
          </Button>
        </nav>
        <div className="app-sider-footer">
          {backendUp === null ? (
            <Tag color="default">检测后端中…</Tag>
          ) : backendUp ? (
            <Tooltip title="FastAPI 服务健康检查通过">
              <Tag color="success">后端在线</Tag>
            </Tooltip>
          ) : (
            <Tooltip title={healthError ?? '无法访问后端'}>
              <Tag color="error">后端离线</Tag>
            </Tooltip>
          )}
          <Button
            size="small"
            type="text"
            icon={<ReloadOutlined spin={checking} />}
            onClick={() => void checkBackend(true)}
          >
            刷新
          </Button>
        </div>
      </aside>

      <main className="app-main">
        {storageError && <Alert type="warning" showIcon message={storageError} style={{ marginBottom: 16 }} />}
        <div hidden={page !== 'new'}>
          <NewRunPage onDone={handleDone} onRunningChange={setRunning} />
        </div>
        {page === 'results' && <ResultsPage key={history[0]?.id} history={history} />}
      </main>
    </div>
  )
}
