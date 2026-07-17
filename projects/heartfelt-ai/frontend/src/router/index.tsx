import { createBrowserRouter } from 'react-router-dom'
import { HumanizePage } from '../pages/HumanizePage'
import { DetectionPage } from '../pages/DetectionPage'
import { HealthPage } from '../pages/HealthPage'
import { PlaceholderPage } from '../pages/PlaceholderPage'

export const router = createBrowserRouter([
  { path: '/', element: <HumanizePage /> },
  { path: '/detection', element: <DetectionPage /> },
  { path: '/health', element: <HealthPage /> },
  { path: '/dashboard', element: <PlaceholderPage title="控制台" /> },
  { path: '/api-docs', element: <PlaceholderPage title="API 文档" /> },
  { path: '/pricing', element: <PlaceholderPage title="定价方案" /> },
])
