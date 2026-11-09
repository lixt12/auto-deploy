package com.sipsg.autodeploy.controller;

import com.sipsg.autodeploy.entity.Server;
import com.sipsg.autodeploy.service.ServerService;
import com.sipsg.autodeploy.service.OperationLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/servers")
@CrossOrigin(origins = "*")
public class ServerController {
    
    @Autowired
    private ServerService serverService;
    
    @Autowired
    private OperationLogService operationLogService;
    
    @GetMapping
    public ResponseEntity<?> getAllServers() {
        try {
            List<Server> servers = serverService.getAllServers();
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", servers);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "获取服务器列表失败: " + e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<?> getServer(@PathVariable Long id) {
        try {
            Server server = serverService.getServerById(id);
            Map<String, Object> response = new HashMap<>();
            if (server != null) {
                response.put("success", true);
                response.put("data", server);
            } else {
                response.put("success", false);
                response.put("message", "服务器不存在");
                return ResponseEntity.status(404).body(response);
            }
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "获取服务器详情失败: " + e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }
    
    @PostMapping
    public ResponseEntity<?> createServer(@RequestBody Server server) {
        try {
            Server createdServer = serverService.createServer(server);
            
            operationLogService.logServerOperation(
                "创建", 
                createdServer.getName(), 
                createdServer.getId(), 
                String.format("成功创建服务器，主机: %s:%d", createdServer.getHost(), createdServer.getPort())
            );
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "服务器创建成功");
            response.put("data", createdServer);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            operationLogService.logError("ServerController", "创建服务器", "主机: " + server.getHost(), e);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "服务器创建失败: " + e.getMessage());
            return ResponseEntity.status(400).body(response);
        }
    }
    
    @PutMapping("/{id}")
    public ResponseEntity<?> updateServer(@PathVariable Long id, @RequestBody Server server) {
        try {
            Server updatedServer = serverService.updateServer(id, server);
            
            operationLogService.logServerOperation(
                "更新", 
                updatedServer.getName(), 
                updatedServer.getId(), 
                String.format("成功更新服务器，服务器ID: %s", id)
            );
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "服务器更新成功");
            response.put("data", updatedServer);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            operationLogService.logError("ServerController", "更新服务器", "服务器ID: " + id, e);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "服务器更新失败: " + e.getMessage());
            return ResponseEntity.status(400).body(response);
        }
    }
    
    @PostMapping("/delete")
    public ResponseEntity<?> deleteServer(@RequestBody Map<String, Object> request) {
        try {
            Object idObj = request.get("id");
            if (idObj == null) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("message", "服务器ID不能为空");
                return ResponseEntity.status(422).body(response);
            }
            
            Long id = Long.parseLong(idObj.toString());
            Server server = serverService.getServerById(id);
            String serverName = server != null ? server.getName() : "服务器-" + id;
            Long serverId = server != null ? server.getId() : null;
            
            serverService.deleteServer(id);
            
            operationLogService.logServerOperation(
                "删除", 
                serverName, 
                serverId, 
                String.format("成功删除服务器，服务器ID: %s", id)
            );
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "服务器删除成功");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            operationLogService.logError("ServerController", "删除服务器", "服务器ID: " + request.get("id"), e);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "服务器删除失败: " + e.getMessage());
            return ResponseEntity.status(400).body(response);
        }
    }
    
    @PostMapping("/test-connection")
    public ResponseEntity<?> testConnection(@RequestBody Map<String, Object> request) {
        try {
            Object idObj = request.get("id");
            if (idObj == null) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("message", "服务器ID不能为空");
                return ResponseEntity.status(422).body(response);
            }
            
            Long id = Long.parseLong(idObj.toString());
            boolean connected = serverService.testConnection(id);
            
            Server server = serverService.getServerById(id);
            if (server != null) {
                operationLogService.logServerOperation(
                    "测试连接", 
                    server.getName(), 
                    server.getId(), 
                    String.format("连接测试结果: %s", connected ? "成功" : "失败")
                );
            }
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("connected", connected);
            response.put("message", connected ? "连接测试成功" : "连接测试失败");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            operationLogService.logError("ServerController", "测试连接", "服务器ID: " + request.get("id"), e);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("connected", false);
            response.put("message", "连接测试失败: " + e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }
}
