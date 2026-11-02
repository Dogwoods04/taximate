package kr.siheung.taximate.conversation.application;
import org.springframework.boot.context.properties.ConfigurationProperties;
@ConfigurationProperties("taximate.conversation")
public record ConversationProperties(int messageMaxLength,int retentionDays) {
    public ConversationProperties { if(messageMaxLength<=0) messageMaxLength=500; if(retentionDays<=0) retentionDays=30; }
}
