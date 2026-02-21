'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import Typewriter from 'typewriter-effect'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { createEvents, EventAttributes } from 'ics'
import Cookies from 'js-cookie'
import { useRouter } from 'next/navigation'

// Environment
const env = process.env.NODE_ENV || 'development'
type User = {
  nickname?: string
} & Record<string, unknown>

const APIList = [
  {
    name: "Hydro",
    description: "Hydro OJ 作业（基于上海科技大学 ACM）",
    tip: "请确保 URL 类似 http://10.15.21.133/d/SI100B_2025_Autumn/，后面不要带作业或登录路径",
    identifierField: "username",
    formdata: [
      { name: "url", type: "text" },
      { name: "username", type: "text" },
      { name: "password", type: "password" }
    ],
    api: "/api/hydro",
  },
  {
    name: "Gradescope",
    description: "Gradescope 作业（基于 gradescope-tool）",
    identifierField: "email",
    formdata: [
      { name: "email", type: "email" },
      { name: "password", type: "password" }
    ],
    api: "/api/gradescope",
  },
  {
    name: "Blackboard",
    description: "上海科技大学 Blackboard",
    identifierField: "studentid",
    formdata: [
      { name: "studentid", type: "text" },
      { name: "password", type: "password" }
    ],
    api: "/api/blackboard",
  },
]

const initialFormValues: Record<string, Record<string, string>> = Object.fromEntries(
  APIList.map((item) => [
    item.name,
    Object.fromEntries(item.formdata.map((field) => [field.name, ""])),
  ])
)

interface DeadlineItem {
  id?: string
  platform?: string
  title: string
  course: string
  due: number
  status?: string
  url?: string
  submitted?: boolean
}

interface HomeClientProps {
  user: User
}

export default function HomeClient({ user }: HomeClientProps) {
  const router = useRouter()
  const [data, setData] = useState<DeadlineItem[]>([])
  const [showHidden, setShowHidden] = useState(false)
  const [icsUrl, setIcsUrl] = useState<string | null>(null)
  const [icsLoading, setIcsLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showInfo, setShowInfo] = useState(true)
  const [showAddManual, setShowAddManual] = useState(false)
  const [manualSaving, setManualSaving] = useState(false)
  const [showIcsOptions, setShowIcsOptions] = useState(false)
  const [sessionStatus, setSessionStatus] = useState<Record<string, 'valid' | 'expired' | 'unknown'>>({})
  const [manualForm, setManualForm] = useState({
    title: '',
    course: '',
    due: '',
    url: '',
    status: ''
  })
  const [detailItem, setDetailItem] = useState<DeadlineItem | null>(null)
  const [editItem, setEditItem] = useState<DeadlineItem | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editForm, setEditForm] = useState({
    title: '',
    course: '',
    due: '',
    url: '',
    status: ''
  })

  useEffect(() => {
    const load = async () => {
      try {
        const [deadlinesRes, statusRes] = await Promise.all([
          fetch('/api/deadlines'),
          fetch('/api/platform-session-status')
        ])
        if (deadlinesRes.ok) {
          const deadlines = await deadlinesRes.json()
          setData(deadlines.items ?? [])
        }
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          const nextStatus: Record<string, 'valid' | 'expired' | 'unknown'> = {}
          for (const item of statusData.items ?? []) {
            if (item.sessionValid === true) {
              nextStatus[item.platform] = 'valid'
            } else if (item.sessionValid === false) {
              nextStatus[item.platform] = 'expired'
            } else {
              nextStatus[item.platform] = 'unknown'
            }
          }
          setSessionStatus(nextStatus)
        }
      } catch (error) {
        console.error(error)
      }
    }

    load()
  }, [])

  const refreshDeadlines = async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/refresh-deadlines')
      if (!res.ok) {
        throw new Error('Refresh failed')
      }
      await res.json()
      const deadlinesRes = await fetch('/api/deadlines')
      if (deadlinesRes.ok) {
        const deadlines = await deadlinesRes.json()
        setData(deadlines.items ?? [])
      }
      const statusRes = await fetch('/api/platform-session-status')
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        const nextStatus: Record<string, 'valid' | 'expired' | 'unknown'> = {}
        for (const item of statusData.items ?? []) {
          if (item.sessionValid === true) {
            nextStatus[item.platform] = 'valid'
          } else if (item.sessionValid === false) {
            nextStatus[item.platform] = 'expired'
          } else {
            nextStatus[item.platform] = 'unknown'
          }
        }
        setSessionStatus(nextStatus)
      }
      toast.success('DDL已刷新')
    } catch (error) {
      console.error(error)
      toast.error('重新获取DDL失败')
    } finally {
      setRefreshing(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' })
      router.push('/login')
    } catch (error) {
      console.error('Logout failed:', error)
      toast.error('退出登录失败')
    }
  }

  const handleGetIcsLink = async () => {
    setIcsLoading(true)
    try {
      const res = await fetch('/api/ics-token')
      if (!res.ok) {
        throw new Error('Failed to get ICS token')
      }
      const json = await res.json()
      setIcsUrl(json.url)
    } catch (error) {
      console.error(error)
      toast.error('获取 ICS 订阅链接失败')
    } finally {
      setIcsLoading(false)
    }
  }

  const handleToggleIcsOptions = async () => {
    if (showIcsOptions) {
      setShowIcsOptions(false)
      return
    }
    if (!icsUrl) {
      await handleGetIcsLink()
    }
    setShowIcsOptions(true)
  }

  const handleRotateIcsLink = async () => {
    setIcsLoading(true)
    try {
      const res = await fetch('/api/ics-token', { method: 'POST' })
      if (!res.ok) {
        throw new Error('Failed to rotate ICS token')
      }
      const json = await res.json()
      setIcsUrl(json.url)
      toast.success('订阅链接已更新')
    } catch (error) {
      console.error(error)
      toast.error('更新订阅链接失败')
    } finally {
      setIcsLoading(false)
    }
  }

  const handleManualFieldChange = (field: keyof typeof manualForm, value: string) => {
    setManualForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleEditFieldChange = (field: keyof typeof editForm, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }))
  }

  const formatLocalDateTime = (timestampSec: number) => {
    const date = new Date(timestampSec * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  const openEdit = (item: DeadlineItem) => {
    setEditItem(item)
    setEditForm({
      title: item.title ?? '',
      course: item.course ?? '',
      due: item.due ? formatLocalDateTime(item.due) : '',
      url: item.url ?? '',
      status: item.status ?? ''
    })
  }

  const handleSaveEdit = async () => {
    if (!editItem) return
    if (editItem.platform !== 'manual') {
      toast.error('仅支持手动添加的DDL修改')
      return
    }
    if (!editItem.id) {
      toast.error('记录ID缺失')
      return
    }
    if (!editForm.title || !editForm.course || !editForm.due) {
      toast.error('请填写标题、课程与截止时间')
      return
    }

    const dueTs = Math.floor(new Date(editForm.due).getTime() / 1000)
    if (!Number.isFinite(dueTs) || dueTs <= 0) {
      toast.error('截止时间无效')
      return
    }

    setEditSaving(true)
    try {
      const res = await fetch(`/api/manual-deadlines/${editItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: {
            title: editForm.title,
            course: editForm.course,
            due: dueTs,
            url: editForm.url,
            status: editForm.status
          }
        })
      })

      if (!res.ok) throw new Error('Failed to update')

      const deadlinesRes = await fetch('/api/deadlines')
      if (deadlinesRes.ok) {
        const deadlines = await deadlinesRes.json()
        setData(deadlines.items ?? [])
      }

      toast.success('已更新')
      setEditItem(null)
    } catch (error) {
      console.error(error)
      toast.error('更新失败')
    } finally {
      setEditSaving(false)
    }
  }

  const handleDeleteEdit = async () => {
    if (!editItem) return
    if (editItem.platform !== 'manual') {
      toast.error('仅支持手动添加的DDL删除')
      return
    }
    if (!editItem.id) {
      toast.error('记录ID缺失')
      return
    }
    if (!window.confirm('确认删除该DDL吗？')) return

    setEditSaving(true)
    try {
      const res = await fetch(`/api/manual-deadlines/${editItem.id}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Failed to delete')

      const deadlinesRes = await fetch('/api/deadlines')
      if (deadlinesRes.ok) {
        const deadlines = await deadlinesRes.json()
        setData(deadlines.items ?? [])
      }

      toast.success('已删除')
      setEditItem(null)
    } catch (error) {
      console.error(error)
      toast.error('删除失败')
    } finally {
      setEditSaving(false)
    }
  }

  const handleSaveManual = async () => {
    if (!manualForm.title || !manualForm.course || !manualForm.due) {
      toast.error('请填写标题、课程与截止时间')
      return
    }

    const dueTs = Math.floor(new Date(manualForm.due).getTime() / 1000)
    if (!Number.isFinite(dueTs) || dueTs <= 0) {
      toast.error('截止时间无效')
      return
    }

    setManualSaving(true)
    try {
      const res = await fetch('/api/manual-deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: {
            title: manualForm.title,
            course: manualForm.course,
            due: dueTs,
            url: manualForm.url,
            status: manualForm.status
          }
        })
      })

      if (!res.ok) throw new Error('Failed to save manual deadline')

      const deadlinesRes = await fetch('/api/deadlines')
      if (deadlinesRes.ok) {
        const deadlines = await deadlinesRes.json()
        setData(deadlines.items ?? [])
      }

      toast.success('已添加手动DDL')
      setShowAddManual(false)
      setManualForm({ title: '', course: '', due: '', url: '', status: '' })
    } catch (error) {
      console.error(error)
      toast.error('添加失败')
    } finally {
      setManualSaving(false)
    }
  }

  const nowSec = Date.now() / 1000
  const recentDeadlines = data.filter(item => item.due >= nowSec)
  const olderDeadlines = data.filter(item => item.due < nowSec)

  const formatYmdHm = (timestampSec: number) => {
    const date = new Date(timestampSec * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        {/* User Status Bar */}
        <div className="flex items-center justify-end gap-4 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
          </div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {user.nickname}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => router.push('/settings')}
          >
            设置
          </Button>
          <Button
            variant="outline"
            size="sm"
            title="退出登录"
            className="text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
          >
            退出登录
          </Button>
        </div>
        <div className="flex flex-col gap-8">
          {/*Functions*/}
          <div className="flex flex-col items-center space-y-6">
            {/*Title */}
            <div className="text-center space-y-4">
              <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Next DDL
              </h1>
              <div className="h-10 text-xl text-slate-600 dark:text-slate-400 font-mono">
                <Typewriter
                  onInit={(typewriter) => {
                    typewriter
                      .typeString('Check your DDL on one site')
                      .pauseFor(2000)
                      .deleteAll()
                      .typeString('Shanghai 3.3 University')
                      .deleteChars(15)
                      .typeString('Tech University cares you!')
                      .pauseFor(2000)
                      .deleteAll()
                      .typeString('DDLs are not the only thing you need to care about')
                      .pauseFor(2000)
                      .deleteAll()
                      .typeString('Next DDL is an open source project~')
                      .pauseFor(2000)
                      .deleteAll()
                      .typeString('Github Repo: ShanghaitechGeekPie/NextDDL')
                      .pauseFor(2000)
                      .deleteAll()
                      .start()
                  }}
                  options={{ loop: true }}
                />
              </div>
            </div>
            {/* Action Buttons */}
            <div className="flex space-x-4">
              <Button
                onClick={refreshDeadlines}
                disabled={refreshing}
              >
                {refreshing && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                重新获取DDL
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowAddManual(true)}
              >
                手动添加DDL
              </Button>
            </div>

          </div>

          {showAddManual && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddManual(false)}>
              <div className="bg-white dark:bg-slate-900 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4">手动添加DDL</h2>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="manual-title">标题</Label>
                    <Input
                      id="manual-title"
                      type="text"
                      value={manualForm.title}
                      onChange={(e) => handleManualFieldChange('title', e.target.value)}
                      placeholder="例如：HW1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manual-course">课程</Label>
                    <Input
                      id="manual-course"
                      type="text"
                      value={manualForm.course}
                      onChange={(e) => handleManualFieldChange('course', e.target.value)}
                      placeholder="例如：SI100B"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manual-due">截止时间</Label>
                    <Input
                      id="manual-due"
                      type="datetime-local"
                      value={manualForm.due}
                      onChange={(e) => handleManualFieldChange('due', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manual-url">链接（可选）</Label>
                    <Input
                      id="manual-url"
                      type="text"
                      value={manualForm.url}
                      onChange={(e) => handleManualFieldChange('url', e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manual-status">状态（可选）</Label>
                    <Input
                      id="manual-status"
                      type="text"
                      value={manualForm.status}
                      onChange={(e) => handleManualFieldChange('status', e.target.value)}
                      placeholder="例如：未提交"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <Button onClick={handleSaveManual} disabled={manualSaving} className="flex-1">
                    {manualSaving ? '保存中...' : '保存'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddManual(false)} className="flex-1">
                    取消
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Info + Timeline */}
          <div className="w-full max-w-6xl mx-auto flex flex-col gap-6 lg:flex-row lg:items-start">
            <Card className="overflow-hidden flex-1 min-w-0">
              <CardHeader>
                <CardTitle>DDL面板</CardTitle>
                <CardDescription>Check your DDL on one site</CardDescription>
              </CardHeader>
              <CardContent className="p-6 max-h-[calc(100vh-12rem)] overflow-y-auto">
                <div className="space-y-4">
                  {/* Older Deadlines (Collapsible) */}
                  {showHidden && olderDeadlines.length > 0 && (
                    <div className="space-y-3 pb-4 border-b">
                      {olderDeadlines.map((item, idx) => (
                        <DeadlineCard
                          key={`old-${idx}`}
                          item={item}
                          isPast
                          onViewDetails={setDetailItem}
                          onEdit={openEdit}
                        />
                      ))}
                    </div>
                  )}

                  {/* Toggle Button */}
                  {olderDeadlines.length > 0 && (
                    <div className="flex justify-center py-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowHidden(!showHidden)}
                        className="gap-2"
                      >
                        {showHidden ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        {showHidden ? '隐藏过期项' : '显示过期项'} ({olderDeadlines.length})
                      </Button>
                    </div>
                  )}

                  {/* Recent Deadlines */}
                  <div className="space-y-3">
                    {recentDeadlines.length === 0 && (
                      <div className="text-center py-8 text-slate-500">
                        <p>暂无即将到期的ddl</p>
                        <p className="text-sm mt-2">请在设置中配置账号以获取ddl</p>
                      </div>
                    )}
                    {recentDeadlines.map((item, idx) => (
                      <DeadlineCard
                        key={`recent-${idx}`}
                        item={item}
                        onViewDetails={setDetailItem}
                        onEdit={openEdit}
                      />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-6 lg:w-[360px]">
              <Card>
                <CardHeader>
                  <CardTitle>日历订阅</CardTitle>
                  <CardDescription>将 DDL 同步到系统日历</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={handleToggleIcsOptions}
                      disabled={icsLoading}
                    >
                      {icsLoading ? '加载中…' : showIcsOptions ? '隐藏订阅选项' : '显示订阅选项'}
                    </Button>
                    {icsUrl && (
                      <Button
                        variant="ghost"
                        onClick={handleRotateIcsLink}
                        disabled={icsLoading}
                      >
                        重新生成订阅链接
                      </Button>
                    )}
                  </div>
                  {icsUrl && showIcsOptions && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        onClick={() => {
                          const webcal = icsUrl.replace(/^https?:/i, 'webcal:')
                          window.open(webcal, '_blank')
                        }}
                      >
                        添加到系统日历
                      </Button>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(icsUrl)
                            toast.success('订阅链接已复制')
                          } catch (error) {
                            console.error(error)
                            toast.error('复制失败')
                          }
                        }}
                      >
                        复制订阅链接
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Session状态</CardTitle>
                  <CardDescription>仅在重新获取DDL时检测</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {APIList.map((platform) => {
                    const status = sessionStatus[platform.name] ?? 'unknown'
                    const dotClass = status === 'valid'
                      ? 'bg-green-500'
                      : status === 'expired'
                        ? 'bg-red-500'
                        : 'bg-slate-300'
                    const text = status === 'valid'
                      ? '有效'
                      : status === 'expired'
                        ? '过期，需重新配置'
                        : '未知'
                    return (
                      <div key={platform.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                          <span>{platform.name}</span>
                        </div>
                        <span className="text-slate-600 dark:text-slate-400">{text}</span>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <div>
                    <CardTitle>关于Next DDL</CardTitle>
                    <CardDescription>由GeekPie维护</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={showInfo ? '收起说明面板' : '展开说明面板'}
                    onClick={() => setShowInfo((prev) => !prev)}
                    className="h-8 w-8"
                  >
                    {showInfo ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CardHeader>
                {showInfo && (
                  <CardContent className="space-y-4 text-sm text-slate-600 dark:text-slate-400">
                    <div>
                      <h3 className="font-semibold text-slate-800 dark:text-slate-200">Next DDL可以...</h3>
                      <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>统一抓取多平台作业截止日期（Hydro、Gradescope、Blackboard）并集中展示</li>
                        <li>支持手动添加DDL并修改</li>
                        <li>支持日历订阅，可导入系统日历，并设置定期更新</li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800 dark:text-slate-200">Next DDL如何保证您的数据安全...</h3>
                      <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>本网站仅保存您在不同平台的会话信息（session），通过session获取DDL，不保存明文账号密码</li>
                        <li>Session数据均使用 AES-256-GCM 加密后存储</li>
                      </ul>
                    </div>
                  </CardContent>
                )}
              </Card>
            </div>
          </div>
        </div>

        {/* Footer Counter */}
        <div className="mt-8 text-center">
          <img
            src="https://ipacel.cc/+/MoeCounter2/?name=hollyddl"
            alt="Visit Counter"
            className="inline-block"
          />
        </div>
      </div>
      <Toaster />
      {detailItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDetailItem(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">DDL详情</h2>
            <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <div>
                <span className="text-slate-500">标题：</span>
                <span>{detailItem.title}</span>
              </div>
              <div>
                <span className="text-slate-500">课程：</span>
                <span>{detailItem.course}</span>
              </div>
              <div>
                <span className="text-slate-500">截止时间：</span>
                <span>{formatYmdHm(detailItem.due)}</span>
              </div>
              {detailItem.status && (
                <div>
                  <span className="text-slate-500">状态：</span>
                  <span>{detailItem.status}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-6">
              {detailItem.url && (
                <Button asChild className="flex-1">
                  <a href={detailItem.url} target="_blank" rel="noreferrer">打开链接</a>
                </Button>
              )}
              <Button variant="outline" onClick={() => setDetailItem(null)} className="flex-1">
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}
      {editItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditItem(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">修改DDL</h2>
            {editItem.platform !== 'manual' && (
              <div className="text-sm text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-2 mb-4">
                仅支持手动添加的DDL修改/删除。
              </div>
            )}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">标题</Label>
                <Input
                  id="edit-title"
                  type="text"
                  value={editForm.title}
                  onChange={(e) => handleEditFieldChange('title', e.target.value)}
                  disabled={editItem.platform !== 'manual'}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-course">课程</Label>
                <Input
                  id="edit-course"
                  type="text"
                  value={editForm.course}
                  onChange={(e) => handleEditFieldChange('course', e.target.value)}
                  disabled={editItem.platform !== 'manual'}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-due">截止时间</Label>
                <Input
                  id="edit-due"
                  type="datetime-local"
                  value={editForm.due}
                  onChange={(e) => handleEditFieldChange('due', e.target.value)}
                  disabled={editItem.platform !== 'manual'}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-url">链接（可选）</Label>
                <Input
                  id="edit-url"
                  type="text"
                  value={editForm.url}
                  onChange={(e) => handleEditFieldChange('url', e.target.value)}
                  disabled={editItem.platform !== 'manual'}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-status">状态（可选）</Label>
                <Input
                  id="edit-status"
                  type="text"
                  value={editForm.status}
                  onChange={(e) => handleEditFieldChange('status', e.target.value)}
                  disabled={editItem.platform !== 'manual'}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              {editItem.platform === 'manual' && (
                <Button onClick={handleSaveEdit} disabled={editSaving} className="flex-1">
                  {editSaving ? '保存中...' : '保存'}
                </Button>
              )}
              {editItem.platform === 'manual' && (
                <Button variant="destructive" onClick={handleDeleteEdit} disabled={editSaving} className="flex-1">
                  删除
                </Button>
              )}
              <Button variant="outline" onClick={() => setEditItem(null)} className="flex-1">
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

interface DeadlineCardProps {
  item: DeadlineItem
  isPast?: boolean
  onViewDetails?: (item: DeadlineItem) => void
  onEdit?: (item: DeadlineItem) => void
}

function DeadlineCard({ item, isPast = false, onViewDetails, onEdit }: DeadlineCardProps) {
  const dueDate = new Date(Number(item.due) * 1000)
  const isOverdue = item.due < Date.now() / 1000
  const now = Date.now()
  const timeUntilDue = item.due * 1000 - now
  const daysUntil = Math.floor(timeUntilDue / (1000 * 60 * 60 * 24))
  const hoursUntil = Math.floor((timeUntilDue % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const pad = (n: number) => String(n).padStart(2, '0')
  const formattedDue = `${dueDate.getFullYear()}/${pad(dueDate.getMonth() + 1)}/${pad(dueDate.getDate())} ${pad(dueDate.getHours())}:${pad(dueDate.getMinutes())}`

  return (
    <div className={`relative pl-8 pb-4 ${!isPast && 'border-l-2 border-blue-200 dark:border-blue-800'}`}>
      {/* Timeline Dot */}
      <div className={`absolute left-0 top-0 -translate-x-1/2 w-4 h-4 rounded-full ${
        isOverdue ? 'bg-slate-400' : isPast ? 'bg-slate-300' : 'bg-blue-500'
      } ring-4 ring-white dark:ring-slate-950`} />

      {/* Content */}
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-lg leading-tight break-words">{item.title}</h3>
          {!isPast && (
            <div className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
              isOverdue
                ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                : daysUntil === 0
                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                  : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
            }`}>
              {isOverdue ? '已过期' : daysUntil === 0 ? `${hoursUntil}小时` : `${daysUntil}天`}
            </div>
          )}
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400">{item.course}</p>

        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-500">
          <time dateTime={dueDate.toISOString()}>
            {formattedDue}
          </time>
          <span>•</span>
          <span>{item.status}</span>
        </div>

        <div className="flex items-center gap-4 mt-1">
          <button
            type="button"
            onClick={() => onViewDetails?.(item)}
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
          >
            查看详情 →
          </button>
          {item.platform === 'manual' && (
            <button
              type="button"
              onClick={() => onEdit?.(item)}
              className="text-sm text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:underline"
            >
              修改
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
