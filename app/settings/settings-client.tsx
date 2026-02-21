'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { CheckCircle2, XCircle, Settings } from 'lucide-react'
import { useRouter } from 'next/navigation'

type User = {
  nickname?: string
} & Record<string, unknown>

const PLATFORMS = [
  {
    name: "Hydro",
    description: "Hydro OJ 作业（基于上海科技大学 ACM）",
    tip: "请确保 URL 类似 http://10.15.21.133/d/SI100B_2025_Autumn/，后面不要带作业或登录路径",
    identifierField: "username",
    fields: [
      { name: "url", type: "text", label: "URL" },
      { name: "username", type: "text", label: "Username" },
      { name: "password", type: "password", label: "Password" }
    ]
  },
  {
    name: "Gradescope",
    description: "Gradescope 作业（基于 gradescope-tool）",
    identifierField: "email",
    fields: [
      { name: "email", type: "email", label: "Email" },
      { name: "password", type: "password", label: "Password" }
    ]
  },
  {
    name: "Blackboard",
    description: "上海科技大学 Blackboard",
    identifierField: "studentid",
    fields: [
      { name: "studentid", type: "text", label: "Student ID" },
      { name: "password", type: "password", label: "Password" }
    ]
  }
]

interface SettingsClientProps {
  user: User
}

export default function SettingsClient({ user }: SettingsClientProps) {
  const router = useRouter()
  const [configuredPlatforms, setConfiguredPlatforms] = useState<Set<string>>(new Set())
  const [editingPlatform, setEditingPlatform] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [retentionDays, setRetentionDays] = useState<string>('30')
  const [savingRetention, setSavingRetention] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [platformRes, settingsRes] = await Promise.all([
          fetch('/api/platform-accounts'),
          fetch('/api/user-settings')
        ])

        if (platformRes.ok) {
          const data = await platformRes.json()
          const configured = new Set<string>()
          for (const item of data.items ?? []) {
            if (item.configured) {
              configured.add(item.platform)
            }
          }
          setConfiguredPlatforms(configured)
        }

        if (settingsRes.ok) {
          const data = await settingsRes.json()
          if (data?.ddlRetentionDays !== undefined && data?.ddlRetentionDays !== null) {
            setRetentionDays(String(data.ddlRetentionDays))
          }
        }
      } catch (error) {
        console.error(error)
      }
    }
    load()
  }, [])

  const openDialog = (platformName: string) => {
    setEditingPlatform(platformName)
    setFormData({})
  }

  const closeDialog = () => {
    setEditingPlatform(null)
    setFormData({})
  }

  const handleFieldChange = (fieldName: string, value: string) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }))
  }

  const handleSave = async () => {
    if (!editingPlatform) return
    setSaving(true)
    try {
      const platform = PLATFORMS.find((p) => p.name === editingPlatform)
      if (!platform) throw new Error('Platform not found')

      const res = await fetch('/api/platform-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{
            platform: platform.name,
            identifierField: platform.identifierField,
            fields: formData
          }]
        })
      })

      if (!res.ok) throw new Error('Failed to save')

      setConfiguredPlatforms((prev) => new Set(prev).add(editingPlatform))

      let refreshOk = false
      try {
        const refreshRes = await fetch('/api/refresh-deadlines')
        refreshOk = refreshRes.ok
        if (refreshOk) {
          await refreshRes.json().catch(() => undefined)
        }
      } catch (refreshError) {
        console.error('Auto-refresh failed:', refreshError)
      }

      if (refreshOk) {
        toast.success(`${editingPlatform} 配置并刷新成功`)
        closeDialog()
      } else {
        toast.error('配置已保存，但刷新失败，请稍后在主页手动刷新')
      }
    } catch (error) {
      console.error(error)
      toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRetention = async () => {
    const value = Number(retentionDays)
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('请输入有效的天数')
      return
    }

    setSavingRetention(true)
    try {
      const res = await fetch('/api/user-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ddlRetentionDays: value })
      })

      if (!res.ok) throw new Error('Failed to save retention days')

      const refreshRes = await fetch('/api/refresh-deadlines')
      if (!refreshRes.ok) throw new Error('Failed to refresh deadlines')

      toast.success('保存成功')
    } catch (error) {
      console.error(error)
      toast.error('保存失败')
    } finally {
      setSavingRetention(false)
    }
  }

  const platform = editingPlatform ? PLATFORMS.find((p) => p.name === editingPlatform) : null

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">个人设置</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">配置您的平台账户及设置</p>
          </div>
          <Button variant="outline" onClick={() => router.push('/')}>
            返回主页
          </Button>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>账号管理</CardTitle>
              <CardDescription>前往 Geekpie Uni-Auth 管理页面</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <a
                  href="https://auth.geekpie.club/account"
                  target="_blank"
                  rel="noreferrer"
                >
                  管理 Geekpie 账号
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>过期DDL保留天数</CardTitle>
              <CardDescription>默认为30天</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Input
                  id="ddl-retention-days"
                  type="number"
                  min={1}
                  step={1}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(e.target.value)}
                  placeholder="30"
                />
              </div>
              <Button onClick={handleSaveRetention} disabled={savingRetention}>
                {savingRetention ? '保存并刷新中...' : '保存并刷新'}
              </Button>
            </CardContent>
          </Card>

          {PLATFORMS.map((p) => {
            const isConfigured = configuredPlatforms.has(p.name)
            return (
              <Card key={p.name}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle>{p.name}</CardTitle>
                      {isConfigured ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-slate-400" />
                      )}
                    </div>
                    <Button
                      variant={isConfigured ? "outline" : "default"}
                      size="sm"
                      onClick={() => openDialog(p.name)}
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      {isConfigured ? '重新配置' : '配置'}
                    </Button>
                  </div>
                  <CardDescription>
                    {isConfigured ? '账户已配置' : '账户未配置'}
                  </CardDescription>
                </CardHeader>
              </Card>
            )
          })}
        </div>

        {/* Dialog */}
        {editingPlatform && platform && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeDialog}>
            <div className="bg-white dark:bg-slate-900 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-xl font-bold mb-4">配置{editingPlatform}账号</h2>
              {platform.description && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  {platform.description}
                </p>
              )}
              {platform.tip && (
                <div className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-2 mb-4">
                  {platform.tip}
                </div>
              )}
              <div className="space-y-4">
                {platform.fields.map((field) => (
                  <div key={field.name} className="space-y-2">
                    <Label htmlFor={field.name}>{field.label}</Label>
                    <Input
                      id={field.name}
                      type={field.type}
                      value={formData[field.name] || ''}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      placeholder={field.label}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-6">
                <Button onClick={handleSave} disabled={saving} className="flex-1">
                  {saving ? '保存中...' : '保存'}
                </Button>
                <Button variant="outline" onClick={closeDialog} className="flex-1">
                  取消
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      <Toaster />
    </div>
  )
}
