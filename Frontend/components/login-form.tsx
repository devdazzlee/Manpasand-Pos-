"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import { Eye, EyeOff } from "lucide-react"
import { loginRequest } from "@/lib/api"
import { Checkbox } from "@/components/ui/checkbox"

interface LoginResponse {
  success: boolean
  message: string
  data: {
    user: {
      email: string
      role: string
    }
    token: string
    branch: string
  }
}

interface LoginFormProps {
  onLogin: (token: string, branch: string, user: { email: string; role: string; branch_id: string | null }) => void
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [rememberPassword, setRememberPassword] = useState(false)
  const { toast } = useToast()

  // Load saved credentials on mount
  useEffect(() => {
    try {
      const savedRememberMe = localStorage.getItem("rememberMe") === "true"
      const savedRememberPassword = localStorage.getItem("rememberPassword") === "true"
      const savedUsername = localStorage.getItem("savedUsername") || ""
      const savedPassword = localStorage.getItem("savedPassword") || ""

      if (savedRememberMe && savedUsername) {
        setRememberMe(true)
        setUsername(savedUsername)
      }

      if (savedRememberPassword && savedPassword) {
        setRememberPassword(true)
        setPassword(savedPassword)
      }
    } catch {
      // ignore localStorage errors
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    setError("")
    setIsLoading(true)
    
    try {
      try {
        const response = await loginRequest(username, password) as LoginResponse
        const { token, branch, user } = response.data
        toast({ variant: "success", title: "Login successful" })

        // Full offline catalog download after this login; remember till for offline sign-in.
        void import("@/lib/offline/prefetch").then(({ markLoginForPrefetch }) => markLoginForPrefetch())
        void import("@/lib/offline/offline-auth").then(({ rememberLogin, rememberBranch }) =>
          rememberLogin({
            email: user?.email || username,
            password,
            token,
            user: {
              id: user?.id,
              email: user?.email || username,
              role: user?.role || "",
              branch_id: user?.branch_id ?? branch?.id ?? null,
            },
          }).then(() => {
            if (branch?.name) {
              void rememberBranch(user?.email || username, branch.name, branch.address || "")
            }
          }),
        )

        if (rememberMe) {
          localStorage.setItem("savedUsername", username)
          localStorage.setItem("rememberMe", "true")
        } else {
          localStorage.removeItem("savedUsername")
          localStorage.removeItem("rememberMe")
        }

        if (rememberPassword) {
          localStorage.setItem("savedPassword", password)
          localStorage.setItem("rememberPassword", "true")
        } else {
          localStorage.removeItem("savedPassword")
          localStorage.removeItem("rememberPassword")
        }

        onLogin(token, branch, user)
      } catch (onlineErr: any) {
        // No internet: unlock with a password already remembered on this till.
        const { offlineSignIn } = await import("@/lib/offline/offline-auth")
        const offline = await offlineSignIn(username, password)
        if (offline.ok) {
          toast({ variant: "success", title: "Offline login", description: "Working offline on this till" })
          onLogin(offline.token, {
            id: offline.user.branch_id || "",
            name: offline.branchName || "Offline branch",
            address: offline.branchAddress,
          } as any, offline.user as any)
          return
        }
        const errorMessage = onlineErr?.message || "Login failed. Please try again."
        setError(errorMessage)
        toast({ variant: "destructive", title: "Login failed", description: errorMessage })
      }
    } finally {
      setIsLoading(false)
    }
  }


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="MANPASAND POS" className="h-20 w-auto max-w-[280px] object-contain" />
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  disabled={isLoading}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex flex-col space-y-2.5">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(Boolean(checked))}
                  disabled={isLoading}
                />
                <Label htmlFor="remember-me" className="text-sm font-normal text-gray-700 cursor-pointer">
                  Remember me
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember-password"
                  checked={rememberPassword}
                  onCheckedChange={(checked) => setRememberPassword(Boolean(checked))}
                  disabled={isLoading}
                />
                <Label htmlFor="remember-password" className="text-sm font-normal text-gray-700 cursor-pointer">
                  Save password on this device
                </Label>
              </div>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <LoadingButton
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700"
              loading={isLoading}
              loadingText="Signing in..."
            >
              Sign In
            </LoadingButton>
            {/* <div className="text-center text-sm text-gray-600">Demo Credentials: admin / admin123</div> */}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
