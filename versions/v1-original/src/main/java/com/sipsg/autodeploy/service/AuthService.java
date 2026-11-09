package com.sipsg.autodeploy.service;

import com.sipsg.autodeploy.entity.User;
import com.sipsg.autodeploy.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Optional;

@Service
public class AuthService {
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private PasswordEncoder passwordEncoder;
    
    public User authenticate(String username, String password) {
        Optional<User> userOpt = userRepository.findByUsername(username);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            if (user.getEnabled() && passwordEncoder.matches(password, user.getPassword())) {
                user.setLastLoginAt(LocalDateTime.now());
                return userRepository.save(user);
            }
        }
        return null;
    }
    
    public User register(String username, String password, String email, User.Role role) {
        if (userRepository.existsByUsername(username)) {
            throw new RuntimeException("用户名已存在");
        }
        
        if (email != null && userRepository.existsByEmail(email)) {
            throw new RuntimeException("邮箱已存在");
        }
        
        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(password));
        user.setEmail(email);
        user.setRole(role != null ? role : User.Role.USER);
        user.setEnabled(true);
        
        return userRepository.save(user);
    }
    
    public boolean changePassword(Long userId, String oldPassword, String newPassword) {
        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            if (passwordEncoder.matches(oldPassword, user.getPassword())) {
                user.setPassword(passwordEncoder.encode(newPassword));
                userRepository.save(user);
                return true;
            }
        }
        return false;
    }
    
    public User resetPassword(Long userId, String newPassword) {
        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            user.setPassword(passwordEncoder.encode(newPassword));
            return userRepository.save(user);
        }
        throw new RuntimeException("用户不存在");
    }
}
