package com.sipsg.autodeploy.controller;

import com.sipsg.autodeploy.entity.User;
import com.sipsg.autodeploy.service.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {
    
    @Autowired
    private AuthService authService;
    
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> request) {
        try {
            String username = request.get("username");
            String password = request.get("password");
            
            User user = authService.authenticate(username, password);
            if (user != null) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", true);
                response.put("message", "登录成功");
                response.put("user", createUserInfo(user));
                response.put("token", "temp-token-" + user.getId()); // 简化的token
                
                return ResponseEntity.ok(response);
            } else {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("message", "用户名或密码错误");
                
                return ResponseEntity.status(401).body(response);
            }
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "登录失败: " + e.getMessage());
            
            return ResponseEntity.status(500).body(response);
        }
    }
    
    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> request) {
        try {
            String username = request.get("username");
            String password = request.get("password");
            String email = request.get("email");
            String roleStr = request.get("role");
            
            User.Role role = roleStr != null ? User.Role.valueOf(roleStr.toUpperCase()) : User.Role.USER;
            
            User user = authService.register(username, password, email, role);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "注册成功");
            response.put("user", createUserInfo(user));
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "注册失败: " + e.getMessage());
            
            return ResponseEntity.status(400).body(response);
        }
    }
    
    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(@RequestBody Map<String, String> request) {
        try {
            String userIdStr = request.get("userId");
            String oldPassword = request.get("oldPassword");
            String newPassword = request.get("newPassword");
            
            Long userId = Long.parseLong(userIdStr);
            boolean success = authService.changePassword(userId, oldPassword, newPassword);
            
            Map<String, Object> response = new HashMap<>();
            if (success) {
                response.put("success", true);
                response.put("message", "密码修改成功");
            } else {
                response.put("success", false);
                response.put("message", "原密码错误");
            }
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "密码修改失败: " + e.getMessage());
            
            return ResponseEntity.status(400).body(response);
        }
    }
    
    private Map<String, Object> createUserInfo(User user) {
        Map<String, Object> userInfo = new HashMap<>();
        userInfo.put("id", user.getId());
        userInfo.put("username", user.getUsername());
        userInfo.put("email", user.getEmail());
        userInfo.put("role", user.getRole().name());
        userInfo.put("enabled", user.getEnabled());
        userInfo.put("createdAt", user.getCreatedAt());
        return userInfo;
    }
}
