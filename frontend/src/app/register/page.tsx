"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Plane, Eye, EyeOff, UserPlus, Loader2 } from "lucide-react";
import { useAuth } from "../auth-context";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import Link from "next/link";

// ==================== Types ====================

interface RegisterForm {
  username: string;
  password: string;
  confirmPassword: string;
}

// ==================== Register Page ====================

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>();

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    try {
      await registerUser(data.username, data.password);
      toast.success("สมัครสมาชิกสำเร็จ! กำลังเข้าสู่ระบบ...");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
      const displayMsg =
        message === "Username already taken"
          ? "ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น"
          : message;
      toast.error(displayMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-indigo-600/8 rounded-full blur-[100px] pointer-events-none" />

      {/* Card */}
      <div className="relative w-full max-w-md">
        {/* Glass card */}
        <div
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl p-8"
          style={{ boxShadow: "0 0 60px rgba(0,123,255,0.08), 0 25px 50px rgba(0,0,0,0.5)" }}
        >
          {/* Header */}
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/30 rounded-xl blur-xl" />
              <div className="relative flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl shadow-lg">
                <Plane className="w-8 h-8 text-white" />
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white tracking-tight">
                FOD Detection System
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                Airport Runway Security Platform
              </p>
            </div>
          </div>

          {/* Divider with label */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-gray-500 flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5" />
              สมัครสมาชิก
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Username */}
            <div className="space-y-2">
              <Label htmlFor="username" className="text-gray-300 text-sm font-medium">
                ชื่อผู้ใช้
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="กรอกชื่อผู้ใช้"
                autoComplete="username"
                disabled={isLoading}
                className="bg-white/5 border-white/15 text-white placeholder:text-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 h-11 transition-all"
                {...register("username", {
                  required: "กรุณากรอกชื่อผู้ใช้",
                  minLength: { value: 3, message: "ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร" },
                })}
              />
              {errors.username && (
                <p className="text-xs text-red-400">{errors.username.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-300 text-sm font-medium">
                รหัสผ่าน
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                  autoComplete="new-password"
                  disabled={isLoading}
                  className="bg-white/5 border-white/15 text-white placeholder:text-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 h-11 pr-11 transition-all"
                  {...register("password", {
                    required: "กรุณากรอกรหัสผ่าน",
                    minLength: { value: 6, message: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" },
                  })}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-400">{errors.password.message}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-gray-300 text-sm font-medium">
                ยืนยันรหัสผ่าน
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  placeholder="กรอกรหัสผ่านอีกครั้ง"
                  autoComplete="new-password"
                  disabled={isLoading}
                  className="bg-white/5 border-white/15 text-white placeholder:text-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 h-11 pr-11 transition-all"
                  {...register("confirmPassword", {
                    required: "กรุณายืนยันรหัสผ่าน",
                    validate: (val) =>
                      val === watch("password") || "รหัสผ่านไม่ตรงกัน",
                  })}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-xs text-red-400">{errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold rounded-lg shadow-lg shadow-blue-500/20 transition-all duration-200 mt-2"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  กำลังสมัครสมาชิก...
                </span>
              ) : (
                "สมัครสมาชิก"
              )}
            </Button>
          </form>

          {/* Link to login */}
          <p className="text-center text-sm text-gray-500 mt-6">
            มีบัญชีอยู่แล้ว?{" "}
            <Link
              href="/login"
              className="text-blue-400 hover:text-blue-300 transition-colors font-medium"
            >
              เข้าสู่ระบบ
            </Link>
          </p>
        </div>

        {/* Bottom badge */}
        <p className="text-center text-xs text-gray-700 mt-4">
          Airport Runway FOD Detection System © 2025
        </p>
      </div>
    </div>
  );
}
