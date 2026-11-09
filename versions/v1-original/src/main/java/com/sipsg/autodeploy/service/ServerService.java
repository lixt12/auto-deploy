package com.sipsg.autodeploy.service;

import com.sipsg.autodeploy.entity.Server;
import com.sipsg.autodeploy.repository.ServerRepository;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class ServerService {
    
    @Autowired
    private ServerRepository serverRepository;
    
    public List<Server> getAllServers() {
        return serverRepository.findAll();
    }
    
    public Server getServerById(Long id) {
        return serverRepository.findById(id).orElse(null);
    }
    
    public List<Server> getServersByUser(Long userId) {
        return serverRepository.findByCreatedByOrderByCreatedAtDesc(userId);
    }
    
    public Server createServer(Server server) {
        if (serverRepository.existsByHostAndPort(server.getHost(), server.getPort())) {
            throw new RuntimeException("该主机和端口的服务器已存在");
        }
        
        server.setCreatedAt(LocalDateTime.now());
        server.setConnectionStatus("UNKNOWN");
        return serverRepository.save(server);
    }
    
    public Server updateServer(Long id, Server serverDetails) {
        Optional<Server> serverOpt = serverRepository.findById(id);
        if (serverOpt.isPresent()) {
            Server server = serverOpt.get();
            
            // 检查主机端口是否重复（排除自己）
            if ((!server.getHost().equals(serverDetails.getHost()) || 
                 !server.getPort().equals(serverDetails.getPort())) && 
                serverRepository.existsByHostAndPort(serverDetails.getHost(), serverDetails.getPort())) {
                throw new RuntimeException("该主机和端口的服务器已存在");
            }
            
            server.setName(serverDetails.getName());
            server.setHost(serverDetails.getHost());
            server.setPort(serverDetails.getPort());
            server.setUsername(serverDetails.getUsername());
            server.setPassword(serverDetails.getPassword());
            server.setPrivateKeyPath(serverDetails.getPrivateKeyPath());
            server.setDescription(serverDetails.getDescription());
            server.setUpdatedAt(LocalDateTime.now());
            
            return serverRepository.save(server);
        }
        throw new RuntimeException("服务器不存在");
    }
    
    public void deleteServer(Long id) {
        if (!serverRepository.existsById(id)) {
            throw new RuntimeException("服务器不存在");
        }
        serverRepository.deleteById(id);
    }
    
    public boolean testConnection(Long serverId) {
        Optional<Server> serverOpt = serverRepository.findById(serverId);
        if (serverOpt.isPresent()) {
            Server server = serverOpt.get();
            boolean connected = performConnectionTest(server);
            
            server.setConnectionStatus(connected ? "ONLINE" : "OFFLINE");
            server.setLastCheckAt(LocalDateTime.now());
            serverRepository.save(server);
            
            return connected;
        }
        return false;
    }
    
    private boolean performConnectionTest(Server server) {
        // 首先测试网络连通性
        if (!testNetworkConnectivity(server)) {
            return false;
        }
        
        // 然后测试SSH连接
        return testSSHConnection(server);
    }
    
    private boolean testNetworkConnectivity(Server server) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(server.getHost(), server.getPort()), 5000);
            return true;
        } catch (IOException e) {
            return false;
        }
    }
    
    private boolean testSSHConnection(Server server) {
        JSch jsch = new JSch();
        Session session = null;
        
        try {
            session = jsch.getSession(server.getUsername(), server.getHost(), server.getPort());
            
            if (server.getPassword() != null && !server.getPassword().trim().isEmpty()) {
                session.setPassword(server.getPassword());
            } else if (server.getPrivateKeyPath() != null && !server.getPrivateKeyPath().trim().isEmpty()) {
                jsch.addIdentity(server.getPrivateKeyPath());
            }
            
            session.setConfig("StrictHostKeyChecking", "no");
            session.setTimeout(10000);
            session.connect();
            
            return session.isConnected();
        } catch (Exception e) {
            return false;
        } finally {
            if (session != null && session.isConnected()) {
                session.disconnect();
            }
        }
    }
}
