package com.sipsg.autodeploy.repository;

import com.sipsg.autodeploy.entity.Server;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ServerRepository extends JpaRepository<Server, Long> {
    
    List<Server> findByCreatedByOrderByCreatedAtDesc(Long createdBy);
    
    boolean existsByHostAndPort(String host, Integer port);
}
