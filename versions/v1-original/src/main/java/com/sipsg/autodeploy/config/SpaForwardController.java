package com.sipsg.autodeploy.config;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class SpaForwardController {

    @GetMapping({
        "/",
        "/login",
        "/dashboard",
        "/projects",
        "/servers",
        "/logs",
        "/settings",
        "/notifications",
        "/users",
        "/profile"
    })
    public String forwardToIndex() {
        return "forward:/index.html";
    }
}
