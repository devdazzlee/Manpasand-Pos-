"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Bell, AlertTriangle, Info, CheckCircle, X, Check, RefreshCw } from "lucide-react"
import { PageLoader } from "@/components/ui/page-loader"
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton"
import apiClient from "@/lib/apiClient"

interface Notification {
  id: string
  title: string
  message: string
  type: "warning" | "success" | "info" | "error"
  timestamp: string
  read: boolean
  priority: "high" | "medium" | "low" | "critical"
  category: string
  notificationType?: string
  is_read?: boolean
  created_at?: string
  metadata?: Record<string, any>
}

interface NotificationSettings {
  lowStockAlerts: boolean
  salesReports: boolean
  systemUpdates: boolean
  inAppNotifications: boolean
  emailNotifications: boolean
  smsNotifications: boolean
}

export function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total: 0,
    unread: 0,
    highPriority: 0,
    today: 0,
  })

  const [settings, setSettings] = useState<NotificationSettings>({
    lowStockAlerts: true,
    salesReports: true,
    systemUpdates: true,
    inAppNotifications: true,
    emailNotifications: true,
    smsNotifications: false,
  })

  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)

  // Fetch notifications from backend
  const fetchNotifications = async () => {
    try {
      setLoading(true)
      const [notificationsRes, statsRes] = await Promise.all([
        apiClient.get('/notifications', {
          params: {
            fetch_all: true,
            offset: 0,
          },
        }),
        apiClient.get('/notifications/stats'),
      ])

      const notificationsData = notificationsRes.data?.data?.notifications || []
      const statsData = statsRes.data?.data || {}

      // Transform backend data to frontend format
      const transformedNotifications = notificationsData.map((n: any) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: mapNotificationType(n.type, n.priority),
        timestamp: new Date(n.created_at).toLocaleString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        read: n.is_read,
        priority: n.priority?.toLowerCase() || 'medium',
        category: n.category || 'system',
        notificationType: n.type,
        metadata: n.metadata,
      }))

      setNotifications(transformedNotifications)
      setStats({
        total: statsData.total || 0,
        unread: statsData.unread || 0,
        highPriority: statsData.highPriority || 0,
        today: statsData.today || 0,
      })
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  // Map backend notification type to frontend type
  const mapNotificationType = (type: string, priority: string): "warning" | "success" | "info" | "error" => {
    const typeMap: Record<string, "warning" | "success" | "info" | "error"> = {
      SALE: 'success',
      STOCK: priority === 'CRITICAL' ? 'error' : 'warning',
      RETURN: 'info',
      EXCHANGE: 'info',
      ORDER: 'info',
      PURCHASE_ORDER: 'info',
      SYSTEM: 'info',
      PAYMENT: 'error',
      CUSTOMER: 'info',
      INVENTORY: 'warning',
    }
    return typeMap[type] || 'info'
  }

  useEffect(() => {
    fetchNotifications()
    // Refresh every 30 seconds
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "info":
        return <Info className="h-4 w-4 text-blue-600" />
      case "error":
        return <X className="h-4 w-4 text-red-600" />
      default:
        return <Bell className="h-4 w-4 text-gray-600" />
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "warning":
        return "bg-yellow-100 text-yellow-800"
      case "success":
        return "bg-green-100 text-green-800"
      case "info":
        return "bg-blue-100 text-blue-800"
      case "error":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800"
      case "medium":
        return "bg-yellow-100 text-yellow-800"
      case "low":
        return "bg-green-100 text-green-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const markAsRead = async (id: string) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`)
      setNotifications((prev) =>
        prev.map((notification) => (notification.id === id ? { ...notification, read: true } : notification)),
      )
      // Refresh stats
      fetchNotifications()
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      await apiClient.patch('/notifications/read-all')
      setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })))
      // Refresh stats
      fetchNotifications()
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error)
    }
  }

  const viewNotification = (notification: Notification) => {
    setSelectedNotification(notification)
    setIsViewDialogOpen(true)
    if (!notification.read) {
      markAsRead(notification.id)
    }
  }

  const updateSetting = (key: keyof NotificationSettings, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const saveSettings = () => {
    // Settings saved (no toast in POS system)
  }

  // Use stats from backend
  const unreadCount = stats.unread
  const highPriorityCount = stats.highPriority
  const todayCount = stats.today
  const alertsCount = notifications.filter((n) => n.category === "system").length

  // Filter functions
  const getFilteredNotifications = (filter: string) => {
    switch (filter) {
      case "unread":
        return notifications.filter((n) => !n.read)
      case "alerts":
        return notifications.filter((n) => n.category === "system")
      default:
        return notifications
    }
  }

  // Utility to replace ₹ or dollar with Rs 
  const formatCurrency = (text: string) => {
    return text.replace(/₹|dollar/gi, "Rs ");
  };

  const renderNotificationsTable = (filteredNotifications: Notification[]) => (
    <div className="overflow-x-auto -mx-4 md:mx-0">
      <div className="inline-block min-w-full align-middle">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[80px]">Type</TableHead>
              <TableHead className="min-w-[150px]">Title</TableHead>
              <TableHead className="min-w-[250px]">Message</TableHead>
              <TableHead className="min-w-[100px]">Priority</TableHead>
              <TableHead className="min-w-[150px]">Time</TableHead>
              <TableHead className="min-w-[100px]">Status</TableHead>
              <TableHead className="min-w-[150px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
      <TableBody>
        {filteredNotifications.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center py-8 text-gray-500">
              No notifications found
            </TableCell>
          </TableRow>
        ) : (
          filteredNotifications.map((notification) => (
            <TableRow key={notification.id} className={notification.read ? "" : "bg-blue-50"}>
              <TableCell>{getTypeIcon(notification.type)}</TableCell>
              <TableCell className="font-medium">{notification.title}</TableCell>
              <TableCell className="max-w-xs truncate">{formatCurrency(notification.message)}</TableCell>
              <TableCell>
                <Badge className={getPriorityColor(notification.priority)}>{notification.priority}</Badge>
              </TableCell>
              <TableCell className="text-sm">{notification.timestamp}</TableCell>
              <TableCell>
                <Badge className={notification.read ? "bg-gray-100 text-gray-800" : "bg-blue-100 text-blue-800"}>
                  {notification.read ? "Read" : "Unread"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => viewNotification(notification)}>
                    View
                  </Button>
                  {!notification.read && (
                    <Button variant="outline" size="sm" onClick={() => markAsRead(notification.id)}>
                      Mark Read
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
      </div>
    </div>
  )

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Notifications</h1>
          <p className="text-sm md:text-base text-gray-600">System notifications and alerts management</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={markAllAsRead} disabled={unreadCount === 0}>
            Mark All Read
          </Button>
          <Button variant="outline" onClick={fetchNotifications} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button>
            <Bell className="w-4 h-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Unread</CardTitle>
                <Bell className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{unreadCount}</div>
                <p className="text-xs text-muted-foreground">New notifications</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">High Priority</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{highPriorityCount}</div>
                <p className="text-xs text-muted-foreground">Require attention</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Today</CardTitle>
                <Info className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{todayCount}</div>
                <p className="text-xs text-muted-foreground">Notifications today</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">System Alerts</CardTitle>
                <Check className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{alertsCount}</div>
                <p className="text-xs text-muted-foreground">System notifications</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Notifications</TabsTrigger>
          <TabsTrigger value="unread">Unread ({unreadCount})</TabsTrigger>
          <TabsTrigger value="alerts">System Alerts ({alertsCount})</TabsTrigger>
          <TabsTrigger value="settings">Notification Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>All Notifications</CardTitle>
              <CardDescription>View and manage all system notifications</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <PageLoader message="Loading notifications..." />
              ) : (
                renderNotificationsTable(getFilteredNotifications("all"))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unread">
          <Card>
            <CardHeader>
              <CardTitle>Unread Notifications</CardTitle>
              <CardDescription>View all unread notifications that require your attention</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <PageLoader message="Loading notifications..." />
              ) : (
                renderNotificationsTable(getFilteredNotifications("unread"))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle>System Alerts</CardTitle>
              <CardDescription>Critical system notifications and alerts</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <PageLoader message="Loading notifications..." />
              ) : (
                renderNotificationsTable(getFilteredNotifications("alerts"))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>Configure notification preferences</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">System Notifications</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Low Stock Alerts</p>
                        <p className="text-sm text-gray-500">Notify when inventory is running low</p>
                      </div>
                      <Switch
                        checked={settings.lowStockAlerts}
                        onCheckedChange={(checked) => updateSetting("lowStockAlerts", checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Sales Reports</p>
                        <p className="text-sm text-gray-500">Daily and weekly sales reports</p>
                      </div>
                      <Switch
                        checked={settings.salesReports}
                        onCheckedChange={(checked) => updateSetting("salesReports", checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">System Updates</p>
                        <p className="text-sm text-gray-500">Notify about software updates</p>
                      </div>
                      <Switch
                        checked={settings.systemUpdates}
                        onCheckedChange={(checked) => updateSetting("systemUpdates", checked)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Delivery Methods</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">In-App Notifications</p>
                        <p className="text-sm text-gray-500">Show notifications in the POS system</p>
                      </div>
                      <Switch
                        checked={settings.inAppNotifications}
                        onCheckedChange={(checked) => updateSetting("inAppNotifications", checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Email Notifications</p>
                        <p className="text-sm text-gray-500">Send notifications to registered email</p>
                      </div>
                      <Switch
                        checked={settings.emailNotifications}
                        onCheckedChange={(checked) => updateSetting("emailNotifications", checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">SMS Notifications</p>
                        <p className="text-sm text-gray-500">Send SMS for critical alerts</p>
                      </div>
                      <Switch
                        checked={settings.smsNotifications}
                        onCheckedChange={(checked) => updateSetting("smsNotifications", checked)}
                      />
                    </div>
                  </div>
                </div>

                <Button onClick={saveSettings}>Save Settings</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* View Notification Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedNotification && getTypeIcon(selectedNotification.type)}
              {selectedNotification?.title}
            </DialogTitle>
            <DialogDescription>{selectedNotification?.timestamp}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Badge className={selectedNotification ? getTypeColor(selectedNotification.type) : ""}>
                {selectedNotification?.type}
              </Badge>
              <Badge className={selectedNotification ? getPriorityColor(selectedNotification.priority) : ""}>
                {selectedNotification?.priority} priority
              </Badge>
              <Badge className={selectedNotification?.read ? "bg-gray-100 text-gray-800" : "bg-blue-100 text-blue-800"}>
                {selectedNotification?.read ? "Read" : "Unread"}
              </Badge>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-gray-900">{selectedNotification ? formatCurrency(selectedNotification.message) : ""}</p>
            </div>
            <div className="text-sm text-gray-500">
              <p>
                <strong>Notification ID:</strong> {selectedNotification?.id}
              </p>
              <p>
                <strong>Category:</strong> {selectedNotification?.category}
              </p>
              <p>
                <strong>Timestamp:</strong> {selectedNotification?.timestamp}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
